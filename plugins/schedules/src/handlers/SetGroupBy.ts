// SetGroupByHandler — set or clear the `groupBy` field on a schedule
// (S41 / ADR-0032).
//
// `groupBy` is a FIELD NAME on the element, not a column id.  Pass
// undefined / null / '' to clear (revert to ungrouped).

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
import { isGroupByField } from '../intent.js';
import { withScheduleSpan } from '../tracing.js';

export interface SetGroupByPayload {
  readonly scheduleId: string;
  /** Field name on the element to group by, or undefined / null / ''
   *  to clear. */
  readonly groupBy?: string | null;
}

type Stores = Readonly<{ schedule: SchedulesState } & Record<string, unknown>>;

export class SetGroupByHandler implements CommandHandler<SetGroupByPayload, Stores> {
  readonly type = 'schedule.setGroupBy';
  readonly affectedStores = ['schedule'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetGroupByPayload): ValidationResult {
    if (typeof cmd.scheduleId !== 'string' || cmd.scheduleId.length === 0) {
      return { valid: false, reason: 'scheduleId must be a non-empty string' };
    }
    if (!ctx.stores.schedule[cmd.scheduleId]) {
      return { valid: false, reason: `schedule not found: ${cmd.scheduleId}` };
    }
    if (!isGroupByField(cmd.groupBy)) {
      return { valid: false, reason: 'groupBy must be undefined / null / "" or an identifier-like string ≤ 64 chars' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetGroupByPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withScheduleSpan('pryzm.schedule.setGroupBy', () => {
      const schedule = ctx.stores.schedule[cmd.scheduleId];
      if (!schedule) throw new ScheduleNotFoundError(cmd.scheduleId);

      const newGroupBy = cmd.groupBy && cmd.groupBy.length > 0 ? cmd.groupBy : undefined;
      const currentGroupBy = schedule.groupBy ?? undefined;
      // No-op short-circuit — emit an EMPTY patch list so undo/redo
      // doesn't grow with no-op commands.
      if (newGroupBy === currentGroupBy) {
        return { forward: [], inverse: [], nextStates: { schedule: ctx.stores.schedule } };
      }

      const [next, forward, inverse] = produceCommand<SchedulesState>(ctx.stores.schedule, (draft) => {
        const s = draft[cmd.scheduleId]!;
        if (newGroupBy === undefined) delete s.groupBy;
        else s.groupBy = newGroupBy;
      });
      return { forward, inverse, nextStates: { schedule: next } };
    }, { scheduleId: cmd.scheduleId });
  }
}
