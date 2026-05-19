// Intent helpers — the validation layer that runs before a handler
// produces patches (S37 / ADR-0031).
//
// Every helper is a PURE PREDICATE — no I/O, no store access — and is
// exported so the handler `canExecute` step and the test suite can
// share the exact same invariants.

import { isPaperSize, isOrientation, type PaperSize, type Orientation } from '@pryzm/plugin-sdk';

/** Sheet number conventionally looks like 'A-001', 'S-100', 'M-12A'.
 *  We enforce the loosest sensible shape (one or more uppercase
 *  letters, dash, one or more alphanumerics) so the format is
 *  recognisable without locking out custom number schemes used on
 *  large project sets. */
export const SHEET_NUMBER_PATTERN = /^[A-Z]+-[A-Z0-9]+$/;

export function isSheetNumberFormat(v: unknown): v is string {
  return typeof v === 'string' && SHEET_NUMBER_PATTERN.test(v);
}

/** Sheet name: any non-empty trimmed string up to 200 chars. */
export const SHEET_NAME_MAX_LEN = 200;
export function isSheetName(v: unknown): v is string {
  return typeof v === 'string'
    && v.trim().length > 0
    && v.length <= SHEET_NAME_MAX_LEN;
}

/** Auto-format a numeric index into a zero-padded sheet number under a
 *  given prefix.  Default: 3-digit pad → 'A-001', 'A-012', 'A-100'.
 *  Indices > 999 grow naturally (4-digit, 5-digit, …) without losing
 *  monotonic ordering. */
export function formatAutoSheetNumber(
  prefix: string,
  index: number,
  pad: number = 3,
): string {
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new Error('[intent] formatAutoSheetNumber: prefix must be non-empty');
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`[intent] formatAutoSheetNumber: index must be a non-negative integer (got ${String(index)})`);
  }
  if (!Number.isInteger(pad) || pad < 1) {
    throw new Error(`[intent] formatAutoSheetNumber: pad must be a positive integer (got ${String(pad)})`);
  }
  return `${prefix.toUpperCase()}-${String(index).padStart(pad, '0')}`;
}

export { isPaperSize, isOrientation };
export type { PaperSize, Orientation };
