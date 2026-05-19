// SetAnnotationTextHeightHandler — set text height in mm at sheet scale (S34 / ADR-0026).
//
// Bounds match the schema refine: positive, finite, ≤ 100 mm.  The bound is
// the unit-confusion guard documented in `Annotation.refine` —
// `packages/schemas/elements/Annotation.ts` line 36.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { AnnotationsState } from '@pryzm/plugin-sdk';
import { AnnotationNotFoundError } from '../errors.js';
import { ANNOTATION_TEXT_HEIGHT_MAX_MM } from '../intent.js';

export interface SetAnnotationTextHeightPayload {
  readonly annotationId: string;
  readonly textHeightMm: number;
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class SetAnnotationTextHeightHandler
  implements CommandHandler<SetAnnotationTextHeightPayload, Stores>
{
  readonly type = 'annotation.setTextHeight';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetAnnotationTextHeightPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.textHeightMm) || cmd.textHeightMm <= 0) {
      return { valid: false, reason: 'textHeightMm must be a positive finite number' };
    }
    if (cmd.textHeightMm > ANNOTATION_TEXT_HEIGHT_MAX_MM) {
      return { valid: false, reason: `textHeightMm must be ≤ ${ANNOTATION_TEXT_HEIGHT_MAX_MM} mm at sheet scale` };
    }
    if (!ctx.stores.annotation[cmd.annotationId]) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetAnnotationTextHeightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.annotation[cmd.annotationId]) throw new AnnotationNotFoundError(cmd.annotationId);
    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      const a = draft[cmd.annotationId];
      if (!a) return;
      a.textHeightMm = cmd.textHeightMm;
    });
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
