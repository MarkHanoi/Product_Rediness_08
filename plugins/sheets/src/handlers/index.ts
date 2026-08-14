// Sheet handler registration (S37–S38 / ADR-0031 / Phase 2C).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateSheetHandler } from './CreateSheet.js';
import { DeleteSheetHandler } from './DeleteSheet.js';
import { RenameSheetHandler } from './RenameSheet.js';
import { ReorderSheetHandler } from './ReorderSheet.js';
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
  // §FIX-SHEET-ADDVIEWPORT-SHADOW (MT-03) — 'sheet.addViewport' is NOT
  // declared here. The executed read-back
  // (apps/editor/__tests__/SheetAddViewportReachesSheetStore.test.ts) proved
  // the §E.5.5 bridge at initBusHandlers.ts:2320 → AddViewportToSheetCommand →
  // core-app-model sheetStore is the arm that reaches authoritative state;
  // this plugin's arm wrote a detached DTO state, was never registered in
  // production (registerSheetHandlers has no production caller), and REFUSED
  // the one live dispatcher's payload shape (ViewsRailPanel.ts:909). Authority
  // declared: the bridge. Loser deleted, not commented. Pin:
  // __tests__/addViewportShadow.test.ts.
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
