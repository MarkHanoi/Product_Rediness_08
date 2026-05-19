// SetAnnotationKindHandler — change the schema-level kind (S34 / ADR-0026).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { AnnotationData, AnnotationsState } from '@pryzm/plugin-sdk';
import { AnnotationNotFoundError } from '../errors.js';
import { isAnnotationKind } from '../intent.js';

export interface SetAnnotationKindPayload {
  readonly annotationId: string;
  readonly kind: AnnotationData['kind'];
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class SetAnnotationKindHandler
  implements CommandHandler<SetAnnotationKindPayload, Stores>
{
  readonly type = 'annotation.setKind';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetAnnotationKindPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
    }
    if (!isAnnotationKind(cmd.kind)) {
      return { valid: false, reason: `kind must be one of the AnnotationKind enum, got: ${String(cmd.kind)}` };
    }
    if (!ctx.stores.annotation[cmd.annotationId]) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetAnnotationKindPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.annotation[cmd.annotationId]) throw new AnnotationNotFoundError(cmd.annotationId);
    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      const a = draft[cmd.annotationId];
      if (!a) return;
      a.kind = cmd.kind;
    });
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
