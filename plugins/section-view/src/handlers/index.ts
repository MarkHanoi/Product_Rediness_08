// Section handler registration (W-09).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateSectionHandler } from './CreateSection.js';
import { DeleteSectionHandler } from './DeleteSection.js';
import { MoveSectionLineHandler } from './MoveSectionLine.js';
import { SetSectionDepthHandler } from './SetSectionDepth.js';
import { SetSectionMarkHandler } from './SetSectionMark.js';
import { SetSectionScaleHandler } from './SetSectionScale.js';

export const SECTION_HANDLER_TYPES = [
  'section.create',
  'section.delete',
  'section.moveLine',
  'section.setDepth',
  'section.setMark',
  'section.setScale',
] as const;

export type SectionHandlerType = (typeof SECTION_HANDLER_TYPES)[number];

export function buildSectionHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateSectionHandler() as unknown as CommandHandler<unknown>,
    new DeleteSectionHandler() as unknown as CommandHandler<unknown>,
    new MoveSectionLineHandler() as unknown as CommandHandler<unknown>,
    new SetSectionDepthHandler() as unknown as CommandHandler<unknown>,
    new SetSectionMarkHandler() as unknown as CommandHandler<unknown>,
    new SetSectionScaleHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerSectionHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildSectionHandlerSet()) bus.register(h);
  return SECTION_HANDLER_TYPES;
}

export { CreateSectionHandler, type CreateSectionPayload } from './CreateSection.js';
export { DeleteSectionHandler, type DeleteSectionPayload } from './DeleteSection.js';
export { MoveSectionLineHandler, type MoveSectionLinePayload } from './MoveSectionLine.js';
export { SetSectionDepthHandler, type SetSectionDepthPayload } from './SetSectionDepth.js';
export { SetSectionMarkHandler, type SetSectionMarkPayload } from './SetSectionMark.js';
export { SetSectionScaleHandler, type SetSectionScalePayload } from './SetSectionScale.js';
