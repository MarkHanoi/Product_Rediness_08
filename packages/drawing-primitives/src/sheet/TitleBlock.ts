// C29 / C24 — Sheet composition primitives (sheet-α-1).
//
// TitleBlock: pure data + small helpers for sheet metadata.
//
// LAYER PURITY: L2 (drawing-primitives). No I/O, no THREE, no DOM. The
// `defaultTitleBlock` builder accepts an optional `now` injector so the
// real-clock read is opt-in (purity for tests).

/**
 * Metadata block stamped onto a sheet — typically rendered into the bottom
 * right title-block region. All fields are optional except the three core
 * identifying fields.
 */
export interface TitleBlock {
  readonly projectName: string;
  readonly sheetNumber: string;
  readonly sheetName: string;
  readonly scale?: string;
  readonly author?: string;
  readonly revision?: string;
  readonly date?: string;
  readonly logoUrl?: string;
  readonly client?: string;
}

/**
 * Build a {@link TitleBlock} with sensible defaults: revision `'A'` and a
 * `YYYY-MM-DD` date string sourced from the optional `now` injector. The
 * injector defaults to `() => new Date()`; tests should pass a deterministic
 * clock.
 */
export function defaultTitleBlock(
  projectName: string,
  sheetNumber: string,
  sheetName: string,
  now: () => Date = () => new Date(),
): TitleBlock {
  const date = now().toISOString().slice(0, 10);
  return {
    projectName,
    sheetNumber,
    sheetName,
    revision: 'A',
    date,
  };
}

/**
 * Format a numeric scale ratio as a human-readable `"N:M"` string.
 *
 *  - `formatScale(1/50)`  → `"1:50"`
 *  - `formatScale(1/100)` → `"1:100"`
 *  - `formatScale(0.5)`   → `"1:2"`
 *  - `formatScale(2)`     → `"2:1"`
 *  - `formatScale(1)`     → `"1:1"`
 *
 * The ratio is interpreted as paper / model. Ratios ≥ 1 are rendered as
 * `"<ratio>:1"`; ratios < 1 are rendered as `"1:<reciprocal>"`. The numerator
 * and denominator are rounded to the nearest integer for display.
 */
export function formatScale(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '1:1';
  if (ratio >= 1) return `${Math.round(ratio)}:1`;
  return `1:${Math.round(1 / ratio)}`;
}
