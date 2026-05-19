// SetAnnotationTextHandler — S34 / ADR-0026.

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

export interface SetAnnotationTextPayload {
  readonly annotationId: string;
  readonly text: string;
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class SetAnnotationTextHandler
  implements CommandHandler<SetAnnotationTextPayload, Stores>
{
  readonly type = 'annotation.setText';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetAnnotationTextPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
    }
    if (typeof cmd.text !== 'string') {
      return { valid: false, reason: 'text must be a string' };
    }
    if (!ctx.stores.annotation[cmd.annotationId]) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetAnnotationTextPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.annotation[cmd.annotationId]) throw new AnnotationNotFoundError(cmd.annotationId);
    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      const a = draft[cmd.annotationId];
      if (!a) return;
      a.text = cmd.text;
    });
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
