// Errors thrown by the schedules plugin (S41 / ADR-0032).
//
// All schedule-plugin errors are typed subclasses of
// `SchedulesPluginError` so handler tests can `instanceof`-discriminate
// without resorting to string-matching on the message.

export class SchedulesPluginError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Thrown when `ScheduleSchema.parse(seed)` rejects a CreateSchedule
 *  seed. */
export class ScheduleSchemaError extends SchedulesPluginError {
  constructor(public override readonly cause: unknown) {
    super(`[schedules] schedule payload failed schema validation: ${String(cause)}`, { cause });
  }
}

/** Thrown when a handler references a schedule id that does not
 *  exist. */
export class ScheduleNotFoundError extends SchedulesPluginError {
  constructor(public readonly scheduleId: string) {
    super(`[schedules] no schedule with id "${scheduleId}"`);
  }
}

/** Thrown when CreateSchedule receives an id that already exists. */
export class DuplicateScheduleIdError extends SchedulesPluginError {
  constructor(public readonly scheduleId: string) {
    super(`[schedules] schedule with id "${scheduleId}" already exists`);
  }
}

/** Thrown when AddColumn receives a column id that already exists on
 *  the target schedule. */
export class DuplicateColumnIdError extends SchedulesPluginError {
  constructor(public readonly scheduleId: string, public readonly columnId: string) {
    super(`[schedules] column id "${columnId}" already exists on schedule "${scheduleId}"`);
  }
}

/** Thrown when a handler references a column id that does not exist
 *  on the target schedule. */
export class ColumnNotFoundError extends SchedulesPluginError {
  constructor(public readonly scheduleId: string, public readonly columnId: string) {
    super(`[schedules] no column with id "${columnId}" on schedule "${scheduleId}"`);
  }
}

/** Thrown when a handler's payload fails an `intent.ts` invariant. */
export class ScheduleIntentError extends SchedulesPluginError {
  constructor(reason: string) {
    super(`[schedules] intent invariant failed: ${reason}`);
  }
}

/** Thrown by the formula parser on a malformed expression.  The
 *  evaluator catches this and surfaces `'#ERR'` in the affected cell. */
export class FormulaParseError extends SchedulesPluginError {
  constructor(public readonly formula: string, public readonly position: number, message: string) {
    super(`[schedules] formula parse error at position ${position}: ${message} (formula="${formula}")`);
  }
}

/** Thrown by the formula evaluator when an identifier resolves to
 *  nothing (no field, no column, not a built-in).  The evaluator
 *  catches and surfaces `'#UNDEF'`. */
export class FormulaUndefinedIdentifierError extends SchedulesPluginError {
  constructor(public readonly name: string) {
    super(`[schedules] undefined identifier "${name}" in formula`);
  }
}

/** Thrown by the formula evaluator when a built-in is called with the
 *  wrong arity.  The evaluator catches and surfaces `'#ERR'`. */
export class FormulaArityError extends SchedulesPluginError {
  constructor(public readonly fn: string, public readonly expected: string, public readonly got: number) {
    super(`[schedules] ${fn}: expected ${expected} argument(s), got ${got}`);
  }
}
