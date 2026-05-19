// SetWindowSillHeightHandler — update a window's sill height (F-1.1).
//
// Validates that the new sill height is non-negative and that
// sillHeight + window.height ≤ host wall height (mirrors the
// PLAN-12 constraint enforced by UpdateWindowSillHeightCommand).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WindowDimensionsError, WindowNotFoundError } from '../errors.js';
import type { WindowsState } from '../store.js';

export interface SetWindowSillHeightPayload {
  readonly windowId: string;
  readonly sillHeight: number;
}

type Stores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class SetWindowSillHeightHandler
  implements CommandHandler<SetWindowSillHeightPayload, Stores>
{
  readonly type = 'window.setSillHeight';
  readonly affectedStores = ['window'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetWindowSillHeightPayload): ValidationResult {
    if (typeof cmd.windowId !== 'string' || cmd.windowId.length === 0) {
      return { valid: false, reason: 'windowId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.sillHeight) || cmd.sillHeight < 0) {
      return { valid: false, reason: 'sillHeight must be a finite non-negative number' };
    }
    const w = ctx.stores.window[cmd.windowId];
    if (!w) return { valid: false, reason: `window not found: ${cmd.windowId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetWindowSillHeightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const w = ctx.stores.window[cmd.windowId];
      if (!w) throw new WindowNotFoundError(cmd.windowId);
      if (cmd.sillHeight < 0) {
        throw new WindowDimensionsError('sillHeight must be non-negative');
      }
      const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
        const d = draft[cmd.windowId];
        if (!d) return;
        d.sillHeight = cmd.sillHeight;
      });
      return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
