// DeleteScheduleHandler — S41 / ADR-0032 / Phase 2C.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';
import { ScheduleNotFoundError } from '../errors.js';
import { withScheduleSpan } from '../tracing.js';

export interface DeleteSchedulePayload {
  readonly scheduleId: string;
}

type Stores = Readonly<{ schedule: SchedulesState } & Record<string, unknown>>;

export class DeleteScheduleHandler implements CommandHandler<DeleteSchedulePayload, Stores> {
  readonly type = 'schedule.delete';
  readonly affectedStores = ['schedule'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: DeleteSchedulePayload): ValidationResult {
    if (typeof cmd.scheduleId !== 'string' || cmd.scheduleId.length === 0) {
      return { valid: false, reason: 'scheduleId must be a non-empty string' };
    }
    if (!ctx.stores.schedule[cmd.scheduleId]) {
      return { valid: false, reason: `schedule not found: ${cmd.scheduleId}` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: DeleteSchedulePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withScheduleSpan('pryzm.schedule.delete', () => {
      if (!ctx.stores.schedule[cmd.scheduleId]) throw new ScheduleNotFoundError(cmd.scheduleId);
      const [next, forward, inverse] = produceCommand<SchedulesState>(ctx.stores.schedule, (draft) => {
        delete draft[cmd.scheduleId];
      });
      return { forward, inverse, nextStates: { schedule: next } };
    }, { scheduleId: cmd.scheduleId });
    }); // withHandlerSpan — C10 §2
  }
}
