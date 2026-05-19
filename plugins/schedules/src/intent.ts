// Intent helpers — the validation layer that runs before a handler
// produces patches (S41 / ADR-0032).
//
// Every helper is a PURE PREDICATE — no I/O, no store access — and is
// exported so the handler `canExecute` step and the test suite can
// share the exact same invariants.

/** Schedule name — non-empty, ≤ 200 chars. */
export const SCHEDULE_NAME_MAX_LEN = 200;
export function isScheduleName(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= SCHEDULE_NAME_MAX_LEN;
}

/** Element-type tag — non-empty store key.  We don't enforce a
 *  registered-store check here (the store registry isn't available at
 *  handler `canExecute` time without ctx); the handler does the
 *  registration check separately when wired into the bus. */
export function isElementType(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 64;
}

/** Column id — non-empty identifier-like string (letters, digits,
 *  hyphen, underscore).  ≤ 64 chars. */
export const COLUMN_ID_PATTERN = /^[A-Za-z0-9_\-]+$/;
export const COLUMN_ID_MAX_LEN = 64;
export function isColumnId(v: unknown): v is string {
  return typeof v === 'string'
    && v.length > 0
    && v.length <= COLUMN_ID_MAX_LEN
    && COLUMN_ID_PATTERN.test(v);
}

/** Column header — non-empty, ≤ 120 chars. */
export const COLUMN_HEADER_MAX_LEN = 120;
export function isColumnHeader(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= COLUMN_HEADER_MAX_LEN;
}

/** Formula source string — accepts the empty string ("no formula" ⇒
 *  null cell).  Soft cap at 2 KiB so a malformed paste can't bloat the
 *  store. */
export const FORMULA_MAX_LEN = 2048;
export function isFormulaSource(v: unknown): v is string {
  return typeof v === 'string' && v.length <= FORMULA_MAX_LEN;
}

/** GroupBy field name — empty / undefined ⇒ no groupBy.  When set:
 *  same shape as a column id (identifier-like). */
export function isGroupByField(v: unknown): v is string | undefined | null {
  if (v === undefined || v === null || v === '') return true;
  return isColumnId(v);
}
