// SetDoorAccessibilityHandler — update a door's accessibility type (F-1.1).
//
// Accessibility type is an optional string (e.g. "wheelchair", "automatic",
// "standard"). No format constraint is enforced — classification codes vary
// by project and locale.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { DoorNotFoundError } from '../errors.js';
import type { DoorsState } from '../store.js';

export interface SetDoorAccessibilityPayload {
  readonly doorId: string;
  readonly accessibilityType: string;
}

type Stores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class SetDoorAccessibilityHandler
  implements CommandHandler<SetDoorAccessibilityPayload, Stores>
{
  readonly type = 'door.setAccessibility';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetDoorAccessibilityPayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (typeof cmd.accessibilityType !== 'string') {
      return { valid: false, reason: 'accessibilityType must be a string' };
    }
    const door = ctx.stores.door[cmd.doorId];
    if (!door) return { valid: false, reason: `door not found: ${cmd.doorId}` };
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetDoorAccessibilityPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const door = ctx.stores.door[cmd.doorId];
      if (!door) throw new DoorNotFoundError(cmd.doorId);
      const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
        const d = draft[cmd.doorId];
        if (d) d.accessibilityType = cmd.accessibilityType || undefined;
      });
      return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
