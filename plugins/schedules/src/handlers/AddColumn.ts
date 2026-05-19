// AddColumnHandler — append or insert a column on a schedule
// (S41 / ADR-0032 / Phase 2C).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  ScheduleColumnSchema,
  type ScheduleColumnDto,
} from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';
import {
  ColumnNotFoundError, // re-exported just for the public surface
  DuplicateColumnIdError,
  ScheduleNotFoundError,
  ScheduleSchemaError,
} from '../errors.js';
import {
  isColumnHeader,
  isColumnId,
  isFormulaSource,
} from '../intent.js';
import { withScheduleSpan } from '../tracing.js';

export interface AddColumnPayload {
  readonly scheduleId: string;
  /** New column to add.  Must satisfy `ScheduleColumnSchema`. */
  readonly column: ScheduleColumnDto;
  /** Insertion index — 0 = prepend, omitted = append. */
  readonly at?: number;
}

type Stores = Readonly<{ schedule: SchedulesState } & Record<string, unknown>>;

export class AddColumnHandler implements CommandHandler<AddColumnPayload, Stores> {
  readonly type = 'schedule.column.add';
  readonly affectedStores = ['schedule'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: AddColumnPayload): ValidationResult {
    if (typeof cmd.scheduleId !== 'string' || cmd.scheduleId.length === 0) {
      return { valid: false, reason: 'scheduleId must be a non-empty string' };
    }
    const schedule = ctx.stores.schedule[cmd.scheduleId];
    if (!schedule) return { valid: false, reason: `schedule not found: ${cmd.scheduleId}` };
    if (!cmd.column || typeof cmd.column !== 'object') {
      return { valid: false, reason: 'column payload required' };
    }
    if (!isColumnId(cmd.column.id)) return { valid: false, reason: `column id must be identifier-like` };
    if (!isColumnHeader(cmd.column.header)) return { valid: false, reason: `column header must be non-empty ≤ 120 chars` };
    if (cmd.column.formula !== undefined && !isFormulaSource(cmd.column.formula)) {
      return { valid: false, reason: `column formula too long (max 2048 chars)` };
    }
    if (schedule.columns.some((c) => c.id === cmd.column.id)) {
      return { valid: false, reason: `column id "${cmd.column.id}" already exists on schedule` };
    }
    if (cmd.at !== undefined) {
      if (!Number.isInteger(cmd.at) || cmd.at < 0 || cmd.at > schedule.columns.length) {
        return { valid: false, reason: `at must be an integer in [0, ${schedule.columns.length}]` };
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: AddColumnPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    void ColumnNotFoundError; // keep import for the public surface; not thrown here
    return withScheduleSpan('pryzm.schedule.addColumn', () => {
      const schedule = ctx.stores.schedule[cmd.scheduleId];
      if (!schedule) throw new ScheduleNotFoundError(cmd.scheduleId);
      if (schedule.columns.some((c) => c.id === cmd.column.id)) {
        throw new DuplicateColumnIdError(cmd.scheduleId, cmd.column.id);
      }
      let parsed: ScheduleColumnDto;
      try { parsed = ScheduleColumnSchema.parse(cmd.column); }
      catch (err) { throw new ScheduleSchemaError(err); }

      const at = cmd.at ?? schedule.columns.length;

      const [next, forward, inverse] = produceCommand<SchedulesState>(ctx.stores.schedule, (draft) => {
        const s = draft[cmd.scheduleId]!;
        s.columns.splice(at, 0, parsed);
      });
      return { forward, inverse, nextStates: { schedule: next } };
    }, { scheduleId: cmd.scheduleId, columnId: cmd.column.id });
    }); // withHandlerSpan — C10 §2
  }
}
