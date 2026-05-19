// CreateWindowHandler — mint a new window (S11-T2).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { Window, createId } from '@pryzm/plugin-sdk';
import {
  WindowSchemaError,
  WindowDimensionsError,
  WindowTypeNotFoundError,
} from '../errors.js';
import type { WindowData, WindowsState } from '../store.js';
import { getWindowType } from '@pryzm/plugin-sdk';

export interface CreateWindowPayload {
  readonly wallId: string;
  readonly openingId: string;
  readonly id?: string;
  readonly offset?: number;
  readonly width?: number;
  readonly height?: number;
  readonly sillHeight?: number;
  readonly windowType?: WindowData['windowType'];
  readonly systemTypeId?: string;
  readonly frameThickness?: number;
  readonly frameWidth?: number;
  readonly frameColor?: string;
  readonly fireRating?: string;
}

type WindowHandlerStores = Readonly<{ window: WindowsState } & Record<string, unknown>>;

export class CreateWindowHandler
  implements CommandHandler<CreateWindowPayload, WindowHandlerStores>
{
  readonly type = 'window.create';
  readonly affectedStores = ['window'] as const;

  canExecute(_ctx: HandlerContext<WindowHandlerStores>, cmd: CreateWindowPayload): ValidationResult {
    if (typeof cmd.wallId !== 'string' || cmd.wallId.length === 0) {
      return { valid: false, reason: 'wallId must be a non-empty string' };
    }
    if (typeof cmd.openingId !== 'string' || cmd.openingId.length === 0) {
      return { valid: false, reason: 'openingId must be a non-empty string' };
    }
    if (cmd.width !== undefined && (!Number.isFinite(cmd.width) || cmd.width <= 0)) {
      return { valid: false, reason: 'width must be > 0' };
    }
    if (cmd.height !== undefined && (!Number.isFinite(cmd.height) || cmd.height <= 0)) {
      return { valid: false, reason: 'height must be > 0' };
    }
    if (cmd.systemTypeId !== undefined && cmd.systemTypeId.length > 0) {
      if (!getWindowType(cmd.systemTypeId)) {
        return { valid: false, reason: `window type not found: ${cmd.systemTypeId}` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<WindowHandlerStores>, cmd: CreateWindowPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const typeDefaults = cmd.systemTypeId ? getWindowType(cmd.systemTypeId) : undefined;
    if (cmd.systemTypeId && !typeDefaults) {
      throw new WindowTypeNotFoundError(cmd.systemTypeId);
    }

    const id = (cmd.id ?? createId('window')) as WindowData['id'];
    const seed: Partial<WindowData> = {
      id,
      wallId: cmd.wallId as WindowData['wallId'],
      openingId: cmd.openingId,
      windowType: cmd.windowType ?? 'single',
      width: cmd.width ?? typeDefaults?.width ?? 1.2,
      height: cmd.height ?? typeDefaults?.height ?? 1.2,
      sillHeight: cmd.sillHeight ?? typeDefaults?.sillHeight ?? 0.9,
      offset: cmd.offset ?? 0,
      frameThickness: cmd.frameThickness ?? typeDefaults?.frameThickness ?? 0.05,
      frameWidth: cmd.frameWidth ?? typeDefaults?.frameWidth ?? 0.05,
      frameColor: cmd.frameColor ?? typeDefaults?.frameColor,
      fireRating: cmd.fireRating ?? typeDefaults?.fireRating,
    };

    let window: WindowData;
    try {
      window = Window.parse(seed);
    } catch (err) {
      throw new WindowSchemaError(err);
    }
    if (window.frameWidth * 2 > window.width) {
      throw new WindowDimensionsError('frameWidth must not exceed half the pane width');
    }

    const [next, forward, inverse] = produceCommand<WindowsState>(ctx.stores.window, (draft) => {
      draft[window.id] = window;
    });
    return { forward, inverse, nextStates: { window: next } };
    }); // withHandlerSpan — C10 §2
  }
}
