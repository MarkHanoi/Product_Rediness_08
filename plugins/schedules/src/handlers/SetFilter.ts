// SetFilterHandler — set or clear the schedule's `filter` formula
// (S41 / ADR-0032).
//
// The empty string is the canonical "no filter" sentinel — passing
// undefined or null is also accepted and normalised to "".  We do NOT
// validate the filter source as a parseable formula here: a user
// mid-edit might paste `width >` and expect the cell to surface
// `'#ERR'` until they finish typing.  Only the length cap (2 KiB) is
// enforced.

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
import { isFormulaSource } from '../intent.js';
import { withScheduleSpan } from '../tracing.js';

export interface SetFilterPayload {
  readonly scheduleId: string;
  /** Filter formula source; '' / undefined / null clears. */
  readonly filter?: string | null;
}

type Stores = Readonly<{ schedule: SchedulesState } & Record<string, unknown>>;

export class SetFilterHandler implements CommandHandler<SetFilterPayload, Stores> {
  readonly type = 'schedule.setFilter';
  readonly affectedStores = ['schedule'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: SetFilterPayload): ValidationResult {
    if (typeof cmd.scheduleId !== 'string' || cmd.scheduleId.length === 0) {
      return { valid: false, reason: 'scheduleId must be a non-empty string' };
    }
    if (!ctx.stores.schedule[cmd.scheduleId]) {
      return { valid: false, reason: `schedule not found: ${cmd.scheduleId}` };
    }
    const f = cmd.filter ?? '';
    if (!isFormulaSource(f)) {
      return { valid: false, reason: 'filter must be a string ≤ 2048 chars' };
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: SetFilterPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withScheduleSpan('pryzm.schedule.setFilter', () => {
      const schedule = ctx.stores.schedule[cmd.scheduleId];
      if (!schedule) throw new ScheduleNotFoundError(cmd.scheduleId);

      const newFilter = cmd.filter ?? '';
      if (newFilter === schedule.filter) {
        return { forward: [], inverse: [], nextStates: { schedule: ctx.stores.schedule } };
      }

      const [next, forward, inverse] = produceCommand<SchedulesState>(ctx.stores.schedule, (draft) => {
        const s = draft[cmd.scheduleId]!;
        s.filter = newFilter;
      });
      return { forward, inverse, nextStates: { schedule: next } };
    }, { scheduleId: cmd.scheduleId });
  }
}
