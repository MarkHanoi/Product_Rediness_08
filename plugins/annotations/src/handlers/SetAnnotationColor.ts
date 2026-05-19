// SetAnnotationColorHandler — set or clear the override color (S34 / ADR-0026).
//
// `color` is a free-form string in the schema; we don't parse CSS here.
// `null` clears the override (annotation falls back to view/style default).

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

export interface SetAnnotationColorPayload {
  readonly annotationId: string;
  /** When `null` the override is cleared. */
  readonly color: string | null;
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class SetAnnotationColorHandler
  implements CommandHandler<SetAnnotationColorPayload, Stores>
{
  readonly type = 'annotation.setColor';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetAnnotationColorPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
    }
    if (cmd.color !== null && typeof cmd.color !== 'string') {
      return { valid: false, reason: 'color must be a string or null' };
    }
    if (!ctx.stores.annotation[cmd.annotationId]) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetAnnotationColorPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.annotation[cmd.annotationId]) throw new AnnotationNotFoundError(cmd.annotationId);
    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      const a = draft[cmd.annotationId];
      if (!a) return;
      if (cmd.color === null) a.color = undefined;
      else a.color = cmd.color;
    });
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
