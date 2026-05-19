// Sheet handler registration (S37–S38 / ADR-0031 / Phase 2C).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateSheetHandler } from './CreateSheet.js';
import { DeleteSheetHandler } from './DeleteSheet.js';
import { RenameSheetHandler } from './RenameSheet.js';
import { ReorderSheetHandler } from './ReorderSheet.js';
import { AddViewportHandler } from './AddViewport.js';
import { RemoveViewportHandler } from './RemoveViewport.js';
import { SetViewportScaleHandler } from './SetViewportScale.js';
import { SetTitleBlockHandler } from './SetTitleBlock.js';
import { SetSheetMetadataHandler } from './SetSheetMetadata.js';
import { AddWidgetHandler } from './AddWidget.js';
import { RemoveWidgetHandler } from './RemoveWidget.js';

export const SHEET_HANDLER_TYPES = [
  // S37 — sheet CRUD.
  'sheet.create',
  'sheet.delete',
  'sheet.rename',
  'sheet.reorder',
  // S38 — viewports + title block + metadata.
  'sheet.addViewport',
  'sheet.removeViewport',
  'sheet.setViewportScale',
  'sheet.setTitleBlock',
  'sheet.setSheetMetadata',
  // S39 — widgets.
  'sheet.addWidget',
  'sheet.removeWidget',
] as const;

export type SheetHandlerType = (typeof SHEET_HANDLER_TYPES)[number];

export function buildSheetHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateSheetHandler() as unknown as CommandHandler<unknown>,
    new DeleteSheetHandler() as unknown as CommandHandler<unknown>,
    new RenameSheetHandler() as unknown as CommandHandler<unknown>,
    new ReorderSheetHandler() as unknown as CommandHandler<unknown>,
    new AddViewportHandler() as unknown as CommandHandler<unknown>,
    new RemoveViewportHandler() as unknown as CommandHandler<unknown>,
    new SetViewportScaleHandler() as unknown as CommandHandler<unknown>,
    new SetTitleBlockHandler() as unknown as CommandHandler<unknown>,
    new SetSheetMetadataHandler() as unknown as CommandHandler<unknown>,
    new AddWidgetHandler() as unknown as CommandHandler<unknown>,
    new RemoveWidgetHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerSheetHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildSheetHandlerSet()) bus.register(h);
  return SHEET_HANDLER_TYPES;
}

export { CreateSheetHandler, type CreateSheetPayload } from './CreateSheet.js';
export { DeleteSheetHandler, type DeleteSheetPayload } from './DeleteSheet.js';
export { RenameSheetHandler, type RenameSheetPayload } from './RenameSheet.js';
export { ReorderSheetHandler, type ReorderSheetPayload } from './ReorderSheet.js';
export { AddViewportHandler, type AddViewportPayload } from './AddViewport.js';
export { RemoveViewportHandler, type RemoveViewportPayload } from './RemoveViewport.js';
export { SetViewportScaleHandler, type SetViewportScalePayload } from './SetViewportScale.js';
export { SetTitleBlockHandler, type SetTitleBlockPayload } from './SetTitleBlock.js';
export {
  SetSheetMetadataHandler,
  type SetSheetMetadataPayload,
  SHEET_METADATA_FIELD_MAX_LEN,
} from './SetSheetMetadata.js';
export { AddWidgetHandler, type AddWidgetPayload } from './AddWidget.js';
export { RemoveWidgetHandler, type RemoveWidgetPayload } from './RemoveWidget.js';
