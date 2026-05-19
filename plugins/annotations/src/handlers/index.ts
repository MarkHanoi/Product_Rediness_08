// Annotation handler registration (S34 / ADR-0026).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateAnnotationHandler } from './CreateAnnotation.js';
import { DeleteAnnotationHandler } from './DeleteAnnotation.js';
import { MoveAnnotationHandler } from './MoveAnnotation.js';
import { SetAnnotationTextHandler } from './SetAnnotationText.js';
import { SetAnnotationKindHandler } from './SetAnnotationKind.js';
import { SetAnnotationRotationHandler } from './SetAnnotationRotation.js';
import { SetAnnotationTextHeightHandler } from './SetAnnotationTextHeight.js';
import { SetAnnotationColorHandler } from './SetAnnotationColor.js';

export const ANNOTATION_HANDLER_TYPES = [
  'annotation.create',
  'annotation.delete',
  'annotation.move',
  'annotation.setText',
  'annotation.setKind',
  'annotation.setRotation',
  'annotation.setTextHeight',
  'annotation.setColor',
] as const;

export type AnnotationHandlerType = (typeof ANNOTATION_HANDLER_TYPES)[number];

export function buildAnnotationHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateAnnotationHandler() as unknown as CommandHandler<unknown>,
    new DeleteAnnotationHandler() as unknown as CommandHandler<unknown>,
    new MoveAnnotationHandler() as unknown as CommandHandler<unknown>,
    new SetAnnotationTextHandler() as unknown as CommandHandler<unknown>,
    new SetAnnotationKindHandler() as unknown as CommandHandler<unknown>,
    new SetAnnotationRotationHandler() as unknown as CommandHandler<unknown>,
    new SetAnnotationTextHeightHandler() as unknown as CommandHandler<unknown>,
    new SetAnnotationColorHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerAnnotationHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildAnnotationHandlerSet()) bus.register(h);
  return ANNOTATION_HANDLER_TYPES;
}

export { CreateAnnotationHandler, type CreateAnnotationPayload } from './CreateAnnotation.js';
export { DeleteAnnotationHandler, type DeleteAnnotationPayload } from './DeleteAnnotation.js';
export { MoveAnnotationHandler, type MoveAnnotationPayload } from './MoveAnnotation.js';
export { SetAnnotationTextHandler, type SetAnnotationTextPayload } from './SetAnnotationText.js';
export { SetAnnotationKindHandler, type SetAnnotationKindPayload } from './SetAnnotationKind.js';
export { SetAnnotationRotationHandler, type SetAnnotationRotationPayload } from './SetAnnotationRotation.js';
export { SetAnnotationTextHeightHandler, type SetAnnotationTextHeightPayload } from './SetAnnotationTextHeight.js';
export { SetAnnotationColorHandler, type SetAnnotationColorPayload } from './SetAnnotationColor.js';
