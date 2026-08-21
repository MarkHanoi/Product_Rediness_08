/**
 * CostModel — 5D. Rates applied to take-off lines, and NOTHING invented.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 by analogy — a price that has not been sourced is a CLAIM,
 *           not a cost, and MUST NOT be written the way a sourced price is.
 * ADR:      ADR-0344 §5D
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE PROHIBITION THIS MODULE EXISTS TO ENCODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **This file ships ZERO rates.** There is no default price table, no €/m²
 * heuristic, no "typical Barcelona" seed, and no code path that can produce one.
 * A cost figure gets believed and quoted; a plausible-looking total that is not
 * derived from a sourced rate is worse than no total at all.
 *
 * Therefore:
 *   • an unpriced line has `rate === null` and `amount === null` — **never `0`**;
 *   • the total sums ONLY priced lines, and every total is inseparable from
 *     {@link CostSummary.coverageStatement}, which says how many lines it covers
 *     and how many it does not;
 *   • every rate carries a `source` string the user supplied. A rate with an
 *     empty source is accepted but reported through `unsourcedRateCount`, so an
 *     estimate built on unattributed numbers still says so.
 *
 * Where do real rates come from? The user types them, or imports a CSV from a
 * price database they hold a licence to — BEDEC (ITeC, Catalonia), the Base de
 * Precios de la Construcción, SPON'S, RSMeans. PRYZM redistributes none of them.
 */

import type { TakeoffLine, TakeoffResult, QuantityUnit } from './TakeoffTypes.js';

// ── Rates ─────────────────────────────────────────────────────────────────────

export interface RateEntry {
  /** Joins to {@link TakeoffLine.code}. */
  readonly lineCode: string;
  /** Price per ONE of the line's unit. Must be finite and ≥ 0. */
  readonly rate: number;
  /** The unit the rate was quoted in — checked against the line's unit. */
  readonly unit: QuantityUnit;
  /**
   * Where this number came from, in the user's words: a price-database code, a
   * quotation reference, a date. May be empty — and an empty one is COUNTED, not
   * ignored (see `unsourcedRateCount`).
   */
  readonly source: string;
}

export interface RateBook {
  /** ISO-4217, e.g. `EUR`. Set by the user; there is no default. */
  readonly currency: string;
  readonly entries: readonly RateEntry[];
}

export type UnpricedReason =
  | 'NO_RATE'
  /** A rate exists but was quoted in a different unit — applying it would be a category error. */
  | 'UNIT_MISMATCH';

export interface CostedLine {
  readonly line: TakeoffLine;
  /** `null` ⇒ this line is NOT in the total. Never coerced to 0. */
  readonly rate: number | null;
  /** `null` ⇒ this line is NOT in the total. Never coerced to 0. */
  readonly amount: number | null;
  readonly source: string | null;
  readonly unpricedReason: UnpricedReason | null;
}

export interface CostSummary {
  /** `null` when no rate has been entered at all — there is no default currency. */
  readonly currency: string | null;
  /** Sum of `amount` over lines that HAVE a rate. Never presented alone. */
  readonly pricedTotal: number;
  readonly pricedLineCount: number;
  readonly unpricedLineCount: number;
  readonly unpricedLineCodes: readonly string[];
  readonly unitMismatchLineCodes: readonly string[];
  /** Priced lines whose rate carries an empty `source`. */
  readonly unsourcedRateCount: number;
  /**
   * The sentence that MUST accompany the total wherever it is shown. Generated
   * here rather than in the UI so a second surface cannot render the total
   * without it.
   */
  readonly coverageStatement: string;
}

export interface CostedTakeoff {
  readonly lines: readonly CostedLine[];
  readonly summary: CostSummary;
}

// ── Application ───────────────────────────────────────────────────────────────

/**
 * Apply a rate book to a take-off. Total-preserving and side-effect free.
 *
 * A line with no matching rate is returned unpriced with a reason — it is never
 * dropped, because a BOQ that hides its unpriced lines reads as complete.
 */
export function applyRates(takeoff: TakeoffResult, book: RateBook | null): CostedTakeoff {
  const byCode = new Map<string, RateEntry>();
  for (const e of book?.entries ?? []) {
    if (!Number.isFinite(e.rate) || e.rate < 0) continue;
    byCode.set(e.lineCode, e);
  }

  const lines: CostedLine[] = [];
  let pricedTotal = 0;
  let pricedLineCount = 0;
  let unsourcedRateCount = 0;
  const unpricedLineCodes: string[] = [];
  const unitMismatchLineCodes: string[] = [];

  for (const line of takeoff.lines) {
    const entry = byCode.get(line.code);
    if (!entry) {
      lines.push({ line, rate: null, amount: null, source: null, unpricedReason: 'NO_RATE' });
      unpricedLineCodes.push(line.code);
      continue;
    }
    if (entry.unit !== line.unit) {
      // A €/m² rate against an `ud` quantity is not an approximation, it is a
      // different number. Refuse rather than multiply.
      lines.push({ line, rate: null, amount: null, source: entry.source || null, unpricedReason: 'UNIT_MISMATCH' });
      unpricedLineCodes.push(line.code);
      unitMismatchLineCodes.push(line.code);
      continue;
    }
    const amount = Math.round(line.quantity * entry.rate * 100) / 100;
    lines.push({ line, rate: entry.rate, amount, source: entry.source || null, unpricedReason: null });
    pricedTotal += amount;
    pricedLineCount++;
    if (!entry.source.trim()) unsourcedRateCount++;
  }

  const total = takeoff.lines.length;
  const unpricedLineCount = unpricedLineCodes.length;

  const parts: string[] = [];
  if (total === 0) {
    parts.push('There are no take-off lines to price.');
  } else if (pricedLineCount === 0) {
    parts.push(`NO LINE IS PRICED. ${total} take-off line${total === 1 ? '' : 's'} ha${total === 1 ? 's' : 've'} no rate, so there is no total.`);
  } else {
    parts.push(`Total covers ${pricedLineCount} of ${total} line${total === 1 ? '' : 's'}.`);
    if (unpricedLineCount > 0) {
      parts.push(`${unpricedLineCount} line${unpricedLineCount === 1 ? ' has' : 's have'} no rate and ${unpricedLineCount === 1 ? 'is' : 'are'} EXCLUDED from the total — they are not zero.`);
    }
    if (unitMismatchLineCodes.length > 0) {
      parts.push(`${unitMismatchLineCodes.length} rate${unitMismatchLineCodes.length === 1 ? ' was' : 's were'} quoted in a different unit than the line measures and ${unitMismatchLineCodes.length === 1 ? 'was' : 'were'} refused.`);
    }
    if (unsourcedRateCount > 0) {
      parts.push(`${unsourcedRateCount} priced line${unsourcedRateCount === 1 ? ' carries a rate with' : 's carry rates with'} no stated source.`);
    }
  }
  // The take-off's own gaps are part of the cost's honesty, not separate from it:
  // a total is only ever "of what was measured".
  const notMeasured = takeoff.coverage.filter((c) => c.state === 'NOT_MEASURED').length;
  if (notMeasured > 0) {
    parts.push(`This is a cost of the MEASURED work only — ${notMeasured} trade${notMeasured === 1 ? '' : 's'} listed in the take-off's coverage table ${notMeasured === 1 ? 'is' : 'are'} NOT MEASURED and therefore NOT PRICED.`);
  }

  return {
    lines,
    summary: {
      currency: book && book.entries.length > 0 ? book.currency : null,
      pricedTotal: Math.round(pricedTotal * 100) / 100,
      pricedLineCount,
      unpricedLineCount,
      unpricedLineCodes,
      unitMismatchLineCodes,
      unsourcedRateCount,
      coverageStatement: parts.join(' '),
    },
  };
}

/** Chapter subtotals over PRICED lines only, with the unpriced count alongside. */
export function chapterSubtotals(
  costed: CostedTakeoff,
): ReadonlyArray<{ chapter: string; priced: number; pricedLines: number; unpricedLines: number }> {
  const acc = new Map<string, { chapter: string; priced: number; pricedLines: number; unpricedLines: number }>();
  for (const c of costed.lines) {
    let row = acc.get(c.line.chapter);
    if (!row) { row = { chapter: c.line.chapter, priced: 0, pricedLines: 0, unpricedLines: 0 }; acc.set(c.line.chapter, row); }
    if (c.amount === null) row.unpricedLines++;
    else { row.priced += c.amount; row.pricedLines++; }
  }
  return [...acc.values()].map((r) => ({ ...r, priced: Math.round(r.priced * 100) / 100 }));
}
