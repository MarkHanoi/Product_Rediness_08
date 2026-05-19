// SetDoorWidthHandler — change a door's leaf width (S11-T1).
//
// Validates `width > 2 * frameWidth` (mirrors the schema refine).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DoorDimensionsError, DoorNotFoundError } from '../errors.js';
import type { DoorsState } from '../store.js';

export interface SetDoorWidthPayload {
  readonly doorId: string;
  readonly width: number;
}

type DoorHandlerStores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class SetDoorWidthHandler
  implements CommandHandler<SetDoorWidthPayload, DoorHandlerStores>
{
  readonly type = 'door.setWidth';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<DoorHandlerStores>, cmd: SetDoorWidthPayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.width) || cmd.width <= 0) {
      return { valid: false, reason: 'width must be a finite number > 0' };
    }
    const door = ctx.stores.door[cmd.doorId];
    if (!door) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    if (cmd.width <= door.frameWidth * 2) {
      return {
        valid: false,
        reason: `width ${cmd.width} must exceed 2 * frameWidth (${door.frameWidth * 2})`,
      };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<DoorHandlerStores>, cmd: SetDoorWidthPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const door = ctx.stores.door[cmd.doorId];
    if (!door) throw new DoorNotFoundError(cmd.doorId);
    if (cmd.width <= door.frameWidth * 2) {
      throw new DoorDimensionsError('frameWidth must not exceed half the leaf width');
    }

    const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
      const d = draft[cmd.doorId];
      if (d) d.width = cmd.width;
    });

    return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
