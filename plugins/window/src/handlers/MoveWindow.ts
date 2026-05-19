// MoveWindowHandler — change window offset along its host wall (S11-T2).

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

export interface MoveWindowPayload {
  readonly windowId: string;
  readonly offset: number;
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class MoveWindowHandler implements CommandHandler<MoveWindowPayload, WindowHandlerStores> {
  readonly type = 'window.move';
  readonly affectedStores = ['window'] as const;

  canExecute(ctx: HandlerContext<WindowHandlerStores>, cmd: MoveWindowPayload): ValidationResult {
    if (typeof cmd.windowId !== 'string' || cmd.windowId.length === 0) {
      return { valid: false, reason: 'windowId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.offset) || cmd.offset < 0) {
      return { valid: false, reason: 'offset must be a finite number ≥ 0' };
    }
    if (!ctx.stores.window[cmd.windowId]) {
      return { valid: false, reason: `window not found: ${cmd.windowId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: MoveWindowPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.window[cmd.windowId]) throw new WindowNotFoundError(cmd.windowId);
    const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
      const w = draft[cmd.windowId];
      if (w) w.offset = cmd.offset;
    });
    return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
