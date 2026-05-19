// MoveAnnotationHandler — translate the anchor by `delta` (S34 / ADR-0026).
//
// Annotations carry a single `anchor: Vec3` (no leader points in the
// canonical schema), so move is a one-point translation.  Plan-view leader
// waypoints are derived per-frame in the renderer adapter; they don't move
// independently from the anchor.

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

export interface MoveAnnotationPayload {
  readonly annotationId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type Stores = Readonly<{ annotation: AnnotationsState } & Record<string, unknown>>;

export class MoveAnnotationHandler
  implements CommandHandler<MoveAnnotationPayload, Stores>
{
  readonly type = 'annotation.move';
  readonly affectedStores = ['annotation'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: MoveAnnotationPayload): ValidationResult {
    if (typeof cmd.annotationId !== 'string' || cmd.annotationId.length === 0) {
      return { valid: false, reason: 'annotationId must be a non-empty string' };
    }
    if (!cmd.delta
        || !Number.isFinite(cmd.delta.x)
        || !Number.isFinite(cmd.delta.y)
        || !Number.isFinite(cmd.delta.z)) {
      return { valid: false, reason: 'delta must have finite x, y, z' };
    }
    if (!ctx.stores.annotation[cmd.annotationId]) {
      return { valid: false, reason: `annotation not found: ${cmd.annotationId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: MoveAnnotationPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.annotation[cmd.annotationId]) throw new AnnotationNotFoundError(cmd.annotationId);
    const [next, forward, inverse] = produceCommand<AnnotationsState>(ctx.stores.annotation, (draft) => {
      const a = draft[cmd.annotationId];
      if (!a) return;
      a.anchor.x += cmd.delta.x;
      a.anchor.y += cmd.delta.y;
      a.anchor.z += cmd.delta.z;
    });
    return { forward, inverse, nextStates: { annotation: next } };
    }); // withHandlerSpan — C10 §2
  }
}
