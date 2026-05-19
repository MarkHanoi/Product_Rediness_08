// CreateScheduleHandler — mint a new schedule (S41 / ADR-0032 / Phase 2C).
//
// Mirrors the CreateSheetHandler shape:
//   • optional id (auto-mint via createId('schedule') if omitted)
//   • optional seq (append at end of nextSeq() + 1 if omitted)
//   • optional initial column list (the editor seeds defaults from a
//     schedule template on first use; tests pass the columns directly)
//   • the seed is run through `ScheduleSchema.parse` to enforce the
//     unique-column-id refine BEFORE patches are produced.

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  ScheduleSchema,
  type ScheduleColumnDto,
  type ScheduleData,
} from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import type { SchedulesState } from '@pryzm/plugin-sdk';
import {
  DuplicateColumnIdError,
  DuplicateScheduleIdError,
  ScheduleSchemaError,
} from '../errors.js';
import {
  isColumnHeader,
  isColumnId,
  isElementType,
  isFormulaSource,
  isGroupByField,
  isScheduleName,
} from '../intent.js';
import { withScheduleSpan } from '../tracing.js';

export interface CreateSchedulePayload {
  readonly id?: string;
  readonly name?: string;
  /** Element family this schedule iterates (storeKey: 'door', 'wall'…). */
  readonly elementType: string;
  /** Optional initial column list.  When omitted the schedule is born
   *  empty (header-only) and the editor adds columns interactively. */
  readonly columns?: readonly ScheduleColumnDto[];
  readonly groupBy?: string;
  readonly filter?: string;
  /** Optional explicit display order; default = append. */
  readonly seq?: number;
}

type Stores = Readonly<{ schedule: SchedulesState } & Record<string, unknown>>;

export class CreateScheduleHandler implements CommandHandler<CreateSchedulePayload, Stores> {
  readonly type = 'schedule.create';
  readonly affectedStores = ['schedule'] as const;

  canExecute(ctx: HandlerContext<Stores>, cmd: CreateSchedulePayload): ValidationResult {
    if (cmd.id !== undefined && (typeof cmd.id !== 'string' || cmd.id.length === 0)) {
      return { valid: false, reason: 'id, when supplied, must be a non-empty string' };
    }
    if (cmd.id !== undefined && ctx.stores.schedule[cmd.id]) {
      return { valid: false, reason: `schedule id "${cmd.id}" already exists` };
    }
    if (cmd.name !== undefined && !isScheduleName(cmd.name)) {
      return { valid: false, reason: 'name must be a non-empty string ≤ 200 chars' };
    }
    if (!isElementType(cmd.elementType)) {
      return { valid: false, reason: 'elementType must be a non-empty string ≤ 64 chars' };
    }
    if (cmd.filter !== undefined && !isFormulaSource(cmd.filter)) {
      return { valid: false, reason: 'filter must be a string ≤ 2048 chars' };
    }
    if (cmd.groupBy !== undefined && !isGroupByField(cmd.groupBy)) {
      return { valid: false, reason: 'groupBy, when supplied, must be an identifier-like string ≤ 64 chars' };
    }
    if (cmd.seq !== undefined && (!Number.isInteger(cmd.seq) || cmd.seq < 0)) {
      return { valid: false, reason: 'seq must be a non-negative integer' };
    }
    if (cmd.columns) {
      const seen = new Set<string>();
      for (const col of cmd.columns) {
        if (!isColumnId(col.id)) return { valid: false, reason: `column id "${col.id}" is not identifier-like` };
        if (!isColumnHeader(col.header)) return { valid: false, reason: `column header for "${col.id}" must be non-empty ≤ 120 chars` };
        if (col.formula !== undefined && !isFormulaSource(col.formula)) {
          return { valid: false, reason: `column formula for "${col.id}" too long (max 2048 chars)` };
        }
        if (seen.has(col.id)) return { valid: false, reason: `duplicate column id "${col.id}" in initial columns` };
        seen.add(col.id);
      }
    }
    return { valid: true };
  }

  execute(ctx: HandlerContext<Stores>, cmd: CreateSchedulePayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    return withScheduleSpan('pryzm.schedule.create', () => {
      const id = (cmd.id ?? createId('schedule')) as ScheduleData['id'];
      if (ctx.stores.schedule[id]) throw new DuplicateScheduleIdError(id);

      // Validate column-id uniqueness one more time (defence in depth).
      if (cmd.columns) {
        const seen = new Set<string>();
        for (const c of cmd.columns) {
          if (seen.has(c.id)) throw new DuplicateColumnIdError(id, c.id);
          seen.add(c.id);
        }
      }

      // Compute seq if not supplied.
      let nextSeq = cmd.seq;
      if (nextSeq === undefined) {
        let max = -1;
        for (const s of Object.values(ctx.stores.schedule)) if (s.seq > max) max = s.seq;
        nextSeq = max + 1;
      }

      const seed: Partial<ScheduleData> = {
        id,
        name: cmd.name ?? `${capitalise(cmd.elementType)} Schedule`,
        elementType: cmd.elementType,
        columns: cmd.columns ? [...cmd.columns] : [],
        filter: cmd.filter ?? '',
        seq: nextSeq,
      };
      if (cmd.groupBy) (seed as { groupBy?: string }).groupBy = cmd.groupBy;

      let s: ScheduleData;
      try { s = ScheduleSchema.parse(seed); }
      catch (err) { throw new ScheduleSchemaError(err); }

      const [next, forward, inverse] = produceCommand<SchedulesState>(ctx.stores.schedule, (draft) => {
        draft[s.id] = s;
      });
      return { forward, inverse, nextStates: { schedule: next } };
    }, { elementType: cmd.elementType });
    }); // withHandlerSpan — C10 §2
  }
}

function capitalise(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
