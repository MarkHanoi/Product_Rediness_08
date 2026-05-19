// DeleteWindowHandler — remove a window (S11-T2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WindowNotFoundError } from '../errors.js';
import type { WindowsState } from '../store.js';

export interface DeleteWindowPayload {
  readonly windowId: string;
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class DeleteWindowHandler
  implements CommandHandler<DeleteWindowPayload, WindowHandlerStores>
{
  readonly type = 'window.delete';
  readonly affectedStores = ['window'] as const;

  canExecute(ctx: HandlerContext<WindowHandlerStores>, cmd: DeleteWindowPayload): ValidationResult {
    if (typeof cmd.windowId !== 'string' || cmd.windowId.length === 0) {
      return { valid: false, reason: 'windowId must be a non-empty string' };
    }
    if (!ctx.stores.window[cmd.windowId]) {
      return { valid: false, reason: `window not found: ${cmd.windowId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: DeleteWindowPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.window[cmd.windowId]) throw new WindowNotFoundError(cmd.windowId);
    const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
      delete draft[cmd.windowId];
    });
    return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
