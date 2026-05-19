// MoveDoorHandler — change door offset along its host wall (S11-T1).

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

export interface MoveDoorPayload {
  readonly doorId: string;
  /** New offset along the host wall baseline, in metres. */
  readonly offset: number;
}

type DoorHandlerStores = Readonly<{ door: DoorsState } & Record<string, unknown>>;

export class MoveDoorHandler implements CommandHandler<MoveDoorPayload, DoorHandlerStores> {
  readonly type = 'door.move';
  readonly affectedStores = ['door'] as const;

  canExecute(ctx: HandlerContext<DoorHandlerStores>, cmd: MoveDoorPayload): ValidationResult {
    if (typeof cmd.doorId !== 'string' || cmd.doorId.length === 0) {
      return { valid: false, reason: 'doorId must be a non-empty string' };
    }
    if (!Number.isFinite(cmd.offset) || cmd.offset < 0) {
      return { valid: false, reason: 'offset must be a finite number ≥ 0' };
    }
    if (!ctx.stores.door[cmd.doorId]) {
      return { valid: false, reason: `door not found: ${cmd.doorId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<DoorHandlerStores>, cmd: MoveDoorPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    if (!ctx.stores.door[cmd.doorId]) throw new DoorNotFoundError(cmd.doorId);

    const [next, forward, inverse] = produceCommand<DoorsState>(ctx.stores.door, (draft) => {
      const d = draft[cmd.doorId];
      if (d) d.offset = cmd.offset;
    });

    return { forward, inverse, nextStates: { door: next } };
    }); // withHandlerSpan — C10 §2
  }
}
