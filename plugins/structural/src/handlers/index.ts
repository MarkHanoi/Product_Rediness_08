// Structural handler registration helper (S26 / ADR-0026).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateStructuralHandler } from './CreateStructural.js';
import { DeleteStructuralHandler } from './DeleteStructural.js';
import { MoveStructuralHandler } from './MoveStructural.js';
import { SetStructuralKindHandler } from './SetStructuralKind.js';
import { SetStructuralDimensionsHandler } from './SetStructuralDimensions.js';
import { SetStructuralMaterialHandler } from './SetStructuralMaterial.js';
import { SetBraceEndOffsetHandler } from './SetBraceEndOffset.js';

export const STRUCTURAL_HANDLER_TYPES = [
  'structural.create',
  'structural.delete',
  'structural.move',
  'structural.setKind',
  'structural.setDimensions',
  'structural.setMaterial',
  'structural.setBraceEndOffset',
] as const;

export type StructuralHandlerType = (typeof STRUCTURAL_HANDLER_TYPES)[number];

export function buildStructuralHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateStructuralHandler() as unknown as CommandHandler<unknown>,
    new DeleteStructuralHandler() as unknown as CommandHandler<unknown>,
    new MoveStructuralHandler() as unknown as CommandHandler<unknown>,
    new SetStructuralKindHandler() as unknown as CommandHandler<unknown>,
    new SetStructuralDimensionsHandler() as unknown as CommandHandler<unknown>,
    new SetStructuralMaterialHandler() as unknown as CommandHandler<unknown>,
    new SetBraceEndOffsetHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerStructuralHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildStructuralHandlerSet()) bus.register(h);
  return STRUCTURAL_HANDLER_TYPES;
}

export { CreateStructuralHandler, type CreateStructuralPayload } from './CreateStructural.js';
export { DeleteStructuralHandler, type DeleteStructuralPayload } from './DeleteStructural.js';
export { MoveStructuralHandler, type MoveStructuralPayload } from './MoveStructural.js';
export { SetStructuralKindHandler, type SetStructuralKindPayload } from './SetStructuralKind.js';
export { SetStructuralDimensionsHandler, type SetStructuralDimensionsPayload } from './SetStructuralDimensions.js';
export { SetStructuralMaterialHandler, type SetStructuralMaterialPayload } from './SetStructuralMaterial.js';
export { SetBraceEndOffsetHandler, type SetBraceEndOffsetPayload } from './SetBraceEndOffset.js';
