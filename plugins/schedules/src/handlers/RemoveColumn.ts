// RemoveColumnHandler — drop a column from a schedule (S41 / ADR-0032).
//
// Side-effect: if the schedule's `groupBy` was set to a column id that
// no longer exists, we'd leave the schedule in a state where the
// evaluator silently produces zero rows.  Per ADR-0032 §"groupBy
// invariants", `groupBy` IS A FIELD NAME ON THE ELEMENT, not a column
// id, so removing a column never invalidates groupBy — but we keep
// this comment as a tripwire for future refactors.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';
import {
  ColumnNotFoundError,
  ScheduleNotFoundError,
} from '../errors.js';
import { withScheduleSpan } from '../tracing.js';

export interface RemoveColumnPayload {
  readonly scheduleId: string;
  readonly columnId: string;
}

type Stores = Readonly<{ schedule: SchedulesState } & Record<string, unknown>>;

export class RemoveColumnHandler implements CommandHandler<RemoveColumnPayload, Stores> {
  readonly type = 'schedule.column.remove';
  readonly affectedStores = ['schedule'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: RemoveColumnPayload): ValidationResult {
    if (typeof cmd.scheduleId !== 'string' || cmd.scheduleId.length === 0) {
      return { valid: false, reason: 'scheduleId must be a non-empty string' };
    }
    if (typeof cmd.columnId !== 'string' || cmd.columnId.length === 0) {
      return { valid: false, reason: 'columnId must be a non-empty string' };
    }
    const schedule = ctx.stores.schedule[cmd.scheduleId];
    if (!schedule) return { valid: false, reason: `schedule not found: ${cmd.scheduleId}` };
    if (!schedule.columns.some((c) => c.id === cmd.columnId)) {
      return { valid: false, reason: `column "${cmd.columnId}" not found on schedule "${cmd.scheduleId}"` };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: RemoveColumnPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withScheduleSpan('pryzm.schedule.removeColumn', () => {
      const schedule = ctx.stores.schedule[cmd.scheduleId];
      if (!schedule) throw new ScheduleNotFoundError(cmd.scheduleId);
      const idx = schedule.columns.findIndex((c) => c.id === cmd.columnId);
      if (idx < 0) throw new ColumnNotFoundError(cmd.scheduleId, cmd.columnId);

      const [next, forward, inverse] = produceCommand<SchedulesState>(ctx.stores.schedule, (draft) => {
        const s = draft[cmd.scheduleId]!;
        s.columns.splice(idx, 1);
      });
      return { forward, inverse, nextStates: { schedule: next } };
    }, { scheduleId: cmd.scheduleId, columnId: cmd.columnId });
    }); // withHandlerSpan — C10 §2
  }
}
