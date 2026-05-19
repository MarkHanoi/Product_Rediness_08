// SetCeilingBoundaryHandler — replace the boundary polygon (S14-T8).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CeilingGeometryError, CeilingNotFoundError } from '../errors.js';
import type { CeilingData, CeilingsState } from '../store.js';
import { validateCeilingBoundary } from '../intent.js';

export interface SetCeilingBoundaryPayload {
  readonly ceilingId: string;
  readonly boundary: CeilingData['boundary'];
}

type CeilingHandlerStores = Readonly<{ ceiling: CeilingsState } & Record<string, unknown>>;

export class SetCeilingBoundaryHandler implements CommandHandler<SetCeilingBoundaryPayload, CeilingHandlerStores> {
  readonly type = 'ceiling.setBoundary';
  readonly affectedStores = ['ceiling'] as const;

  canExecute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingBoundaryPayload): ValidationResult {
    const v = validateCeilingBoundary(cmd.boundary);
    if (!v.ok) return { valid: false, reason: v.reason ?? 'invalid boundary' };
    return (ctx.stores.ceiling as CeilingsState)[cmd.ceilingId]
      ? { valid: true }
      : { valid: false, reason: `ceiling not found: ${cmd.ceilingId}` };
  }

  execute(ctx: HandlerContext<CeilingHandlerStores>, cmd: SetCeilingBoundaryPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!(ctx.stores.ceiling as CeilingsState)[cmd.ceilingId]) throw new CeilingNotFoundError(cmd.ceilingId);
    const v = validateCeilingBoundary(cmd.boundary);
    if (!v.ok) throw new CeilingGeometryError(v.reason ?? 'invalid boundary');
    const [next, forward, inverse] = produceCommand<CeilingsState>(ctx.stores.ceiling, (draft) => {
      const dto = (draft as Record<string, CeilingData>)[cmd.ceilingId];
      if (!dto) return;
      (draft as Record<string, CeilingData>)[cmd.ceilingId] = { ...dto, boundary: cmd.boundary };
    });
    return { forward, inverse, nextStates: { ceiling: next } };
    }); // withHandlerSpan — C10 §2
  }
}
