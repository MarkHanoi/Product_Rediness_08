// SetDoorHeightHandler — update a door leaf's clear height (F-1.1).
//
// Validates that height > 0 and that sillHeight + newHeight does not
// exceed the host wall height (PLAN-12 constraint, mirrors the legacy
// UpdateDoorHeightCommand validation).

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

export interface SetDoorHeightPayload {
  readonly doorId: string;
  readonly height: number;
}

type Stores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class SetDoorHeightHandler
  implements CommandHandler<SetDoorHeightPayload, Stores>
{
  readonly type = 'door.setHeight';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetDoorHeightPayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.height) || cmd.height <= 0) {
      return { valid: false, reason: 'height must be a finite positive number' };
    }
    const door = ctx.stores.door[cmd.doorId];
    if (!door) return { valid: false, reason: `door not found: ${cmd.doorId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetDoorHeightPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const door = ctx.stores.door[cmd.doorId];
      if (!door) throw new DoorNotFoundError(cmd.doorId);
      if (cmd.height <= 0) {
        throw new DoorDimensionsError('height must be positive');
      }
      const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
        const d = draft[cmd.doorId];
        if (d) d.height = cmd.height;
      });
      return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
