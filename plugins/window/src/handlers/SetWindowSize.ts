// SetWindowSizeHandler — change window width and/or height (S11-T2).

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

export interface SetWindowSizePayload {
  readonly windowId: string;
  readonly width?: number;
  readonly height?: number;
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class SetWindowSizeHandler
  implements CommandHandler<SetWindowSizePayload, WindowHandlerStores>
{
  readonly type = 'window.setSize';
  readonly affectedStores = ['window'] as const;

  canExecute(ctx: HandlerContext<WindowHandlerStores>, cmd: SetWindowSizePayload): ValidationResult {
    if (typeof cmd.windowId !== 'string' || cmd.windowId.length === 0) {
      return { valid: false, reason: 'windowId must be a non-empty string' };
    }
    if (cmd.width === undefined && cmd.height === undefined) {
      return { valid: false, reason: 'at least one of width / height must be provided' };
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be a finite number > 0' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be a finite number > 0' };
    }
    const w = ctx.stores.window[cmd.windowId];
    if (!w) return { valid: false, reason: `window not found: ${cmd.windowId}` };
    if (cmd.width !== undefined && cmd.width <= w.frameWidth * 2) {
      return {
        valid: false,
        reason: `width ${cmd.width} must exceed 2 * frameWidth (${w.frameWidth * 2})`,
      };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: SetWindowSizePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const w = ctx.stores.window[cmd.windowId];
    if (!w) throw new WindowNotFoundError(cmd.windowId);
    if (cmd.width !== undefined && cmd.width <= w.frameWidth * 2) {
      throw new WindowDimensionsError('frameWidth must not exceed half the pane width');
    }
    const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
      const d = draft[cmd.windowId];
      if (!d) return;
      if (cmd.width !== undefined) d.width = cmd.width;
      if (cmd.height !== undefined) d.height = cmd.height;
    });
    return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
