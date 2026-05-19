// SetWindowTypeHandler — change a window's systemTypeId and re-apply
// the catalogue defaults (S11-T2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { WindowNotFoundError, WindowTypeNotFoundError } from '../errors.js';
import type { WindowData, WindowsState } from '../store.js';
import { getWindowType } from '@pryzm/plugin-sdk';

export interface SetWindowTypePayload {
  readonly windowId: string;
  readonly systemTypeId: string;
  readonly applyDefaults?: boolean;
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class SetWindowTypeHandler
  implements CommandHandler<SetWindowTypePayload, WindowHandlerStores>
{
  readonly type = 'window.setType';
  readonly affectedStores = ['window'] as const;

  canExecute(ctx: HandlerContext<WindowHandlerStores>, cmd: SetWindowTypePayload): ValidationResult {
    if (typeof cmd.windowId !== 'string' || cmd.windowId.length === 0) {
      return { valid: false, reason: 'windowId must be a non-empty string' };
    }
    if (typeof cmd.systemTypeId !== 'string' || cmd.systemTypeId.length === 0) {
      return { valid: false, reason: 'systemTypeId must be a non-empty string' };
    }
    if (!ctx.stores.window[cmd.windowId]) {
      return { valid: false, reason: `window not found: ${cmd.windowId}` };
    }
    if (!getWindowType(cmd.systemTypeId)) {
      return { valid: false, reason: `window type not found: ${cmd.systemTypeId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: SetWindowTypePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const w = ctx.stores.window[cmd.windowId];
    if (!w) throw new WindowNotFoundError(cmd.windowId);
    const t = getWindowType(cmd.systemTypeId);
    if (!t) throw new WindowTypeNotFoundError(cmd.systemTypeId);
    const apply = cmd.applyDefaults !== false;

    const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
      const d = draft[cmd.windowId] as WindowData | undefined;
      if (!d) return;
      if (apply) {
        d.width = t.width;
        d.height = t.height;
        d.sillHeight = t.sillHeight;
        d.frameThickness = t.frameThickness;
        d.frameWidth = t.frameWidth;
        d.frameColor = t.frameColor;
        if (t.fireRating !== undefined) d.fireRating = t.fireRating;
      }
    });
    return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
