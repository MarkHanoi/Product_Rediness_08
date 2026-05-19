// SetWindowFireRatingHandler — update a window's fire-rating classification (F-1.1).
//
// Fire rating is an optional string (e.g. "FD30", "FD60", "none").
// No format constraint is enforced here — BIM classification codes vary
// by locale and project standard.

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

export interface SetWindowFireRatingPayload {
  readonly windowId: string;
  readonly fireRating: string;
}

type Stores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class SetWindowFireRatingHandler
  implements CommandHandler<SetWindowFireRatingPayload, Stores>
{
  readonly type = 'window.setFireRating';
  readonly affectedStores = ['window'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetWindowFireRatingPayload): ValidationResult {
    if (typeof cmd.windowId !== 'string' || cmd.windowId.length === 0) {
      return { valid: false, reason: 'windowId must be a non-empty string' };
    }
    if (typeof cmd.fireRating !== 'string') {
      return { valid: false, reason: 'fireRating must be a string' };
    }
    const w = ctx.stores.window[cmd.windowId];
    if (!w) return { valid: false, reason: `window not found: ${cmd.windowId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetWindowFireRatingPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const w = ctx.stores.window[cmd.windowId];
      if (!w) throw new WindowNotFoundError(cmd.windowId);
      const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
        const d = draft[cmd.windowId];
        if (!d) return;
        d.fireRating = cmd.fireRating || undefined;
      });
      return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
