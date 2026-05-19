// RecomputeHandrailHandler — re-emit the handrail's path from a host edge.
// Triggered by `cross.stair-handrail` cascade rule.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { HandrailGeometryError, HandrailNotFoundError } from '../errors.js';
import type { HandrailData, HandrailsState } from '../store.js';
import { validateHandrailPath } from '../intent.js';

export interface RecomputeHandrailPayload {
  readonly handrailId: string;
  readonly path: HandrailData['path'];
  readonly cause?: string;
  readonly stairId?: string;
}

type HandrailHandlerStores = Readonly<{ handrail: HandrailsState } & Record<string, unknown>>;

export class RecomputeHandrailHandler implements CommandHandler<RecomputeHandrailPayload, HandrailHandlerStores> {
  readonly type = 'handrail.recompute';
  readonly affectedStores = ['handrail'] as const;

  canExecute(ctx: HandlerContext<HandrailHandlerStores>, cmd: RecomputeHandrailPayload): ValidationResult {
    const v = validateHandrailPath(cmd.path);
    if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid path' };
    return (ctx.stores.handrail as HandrailsState)[cmd.handrailId]
      ? { valid: true }
      : { valid: false, reason: `handrail not found: ${cmd.handrailId}` };
  }

  execute(ctx: HandlerContext<HandrailHandlerStores>, cmd: RecomputeHandrailPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.handrail as HandrailsState)[cmd.handrailId]) throw new HandrailNotFoundError(cmd.handrailId);
    const v = validateHandrailPath(cmd.path);
    if (!v.ok) throw new HandrailGeometryError(v.reason ?? 'path invalid');
    const [next, forward, inverse] = produceCommand<HandrailsState>(ctx.stores.handrail, (draft) => {
      const dto = (draft as Record<string, HandrailData>)[cmd.handrailId];
      if (!dto) return;
      (draft as Record<string, HandrailData>)[cmd.handrailId] = { ...dto, path: cmd.path };
    });
    return { forward, inverse, nextStates: { handrail: next } };
    }); // withHandlerSpan — C10 §2
  }
}
