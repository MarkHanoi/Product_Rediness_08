// DeleteCurtainWallHandler — remove a curtain wall (S12-T5).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { CurtainWallNotFoundError } from '../errors.js';
import type { CurtainWallsState } from '../store.js';

export interface DeleteCurtainWallPayload { readonly curtainWallId: string }

type CWStores = Readonly<{ curtainwall: CurtainWallsState } & Record<string, unknown>>;

export class DeleteCurtainWallHandler
  implements CommandHandler<DeleteCurtainWallPayload, CWStores>
{
  readonly type = 'curtainwall.delete';
  readonly affectedStores = ['curtainwall'] as const;

  canExecute(ctx: HandlerContext<CWStores>, cmd: DeleteCurtainWallPayload): ValidationResult {
    if (typeof cmd.curtainWallId !== 'string' || cmd.curtainWallId.length === 0) {
      return { valid: false, reason: 'curtainWallId must be a non-empty string' };
    }
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) {
      return { valid: false, reason: `curtain wall not found: ${cmd.curtainWallId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<CWStores>, cmd: DeleteCurtainWallPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.curtainwall[cmd.curtainWallId]) throw new CurtainWallNotFoundError(cmd.curtainWallId);
    const [next, forward, inverse] = produceCommand<CurtainWallsState>(ctx.stores.curtainwall, (draft) => {
      delete draft[cmd.curtainWallId];
    });
    return { forward, inverse, nextStates: { curtainwall: next } };
    }); // withHandlerSpan — C10 §2
  }
}
