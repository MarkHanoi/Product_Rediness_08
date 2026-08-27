/**
 * CostModel — 5D. Rates applied to take-off lines, and NOTHING invented.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 by analogy — a price that has not been sourced is a CLAIM,
 *           not a cost, and MUST NOT be written the way a sourced price is.
 * ADR:      ADR-0350 §5D
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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ AMENDED 2026-08-22, lane MEDI14 (ADR-0353 §2) — THE ESTIMATE ARM
 * ─────────────────────────────────────────────────────────────────────────────
 * The paragraph above said "There is no default and there is no estimate." The
 * founder reversed the ESTIMATE half deliberately: a geolocated project should be
 * able to say roughly what it comes to. **The prohibition above is UNCHANGED for
 * everything else** — this file still ships zero rates, and
 * `REGIONAL_RATES.REGIONAL_RATE_BOOKS` is empty because every candidate price
 * base is licensed or has a licence nobody has read.
 *
 * The estimate arm is therefore a MECHANISM with no numbers in it, and it is
 * built so that an estimate can never be mistaken for a price:
 *
 *   • `CostedLine.estimate` is a SEPARATE field from `rate`/`amount`;
 *   • a line the user has priced gets NO estimate at all — the user always wins;
 *   • `pricedTotal` is UNCHANGED and contains no estimated money, ever;
 *   • `estimatedTotal` is its own figure and its own line count;
 *   • every estimate carries its database, edition and PRICE DATE, and the
 *     coverage statement says all of that in words.
 *
 * ⛔ MUST NOT: add `estimatedTotal` into `pricedTotal`, or offer a single
 * "total" that silently contains both. An estimate that cannot be told apart
 * from a measurement is a regression even though it looks like a feature.
 */

import type { TakeoffLine, TakeoffResult, QuantityUnit } from './TakeoffTypes.js';
import { regionalRateForLine, type RatePriceProvenance, type ResolvedRateBooks } from './RegionalRates.js';

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

// ── §RATES157 (L-12503) — the ONE key format for the browser-cached rate book ──
//
// The rate book's DURABLE home is the project snapshot (`ProjectSnapshot.rates`,
// written by `ProjectSerializer` / restored by `ProjectLoader`) — see those files
// for the persistence half. This module only owns the KEY FORMAT for the
// per-browser `localStorage` cache that sits in front of it: the UI
// (`apps/editor/src/ui/dataworkbench/buckets/MedicionesBucket.ts`) reads/writes
// this cache directly for latency, and the engine persistence layer
// (`ProjectSerializer`/`ProjectLoader`) reads/writes the SAME cache to move rates
// into and out of the snapshot. Both sides import this pure helper rather than
// each carrying their own copy of the prefix string — a second, silently
// divergent copy of a storage key is exactly how a value goes "missing" while
// still sitting in the browser under a slightly different name.
//
// Pure: no localStorage access here, just the string format. L2 (`core-app-model`)
// does the I/O nowhere in this file; the app layer keeps that.
export const RATE_BOOK_STORAGE_KEY_PREFIX = 'pryzm.mediciones.rates.';

/** The per-project localStorage key for the cached rate book. `projectId` absent
 *  or empty maps to the `'unscoped'` bucket — matches the pre-existing behaviour
 *  of `MedicionesBucket.ts`'s `rateKey()`, unchanged by this extraction. */
export function rateBookStorageKey(projectId: string | null | undefined): string {
  return RATE_BOOK_STORAGE_KEY_PREFIX + (projectId && projectId.length > 0 ? projectId : 'unscoped');
}

export type UnpricedReason =
  | 'NO_RATE'
  /** A rate exists but was quoted in a different unit — applying it would be a category error. */
  | 'UNIT_MISMATCH';

/**
 * §REGIONAL-COST-ESTIMATE (L-4830) — a published regional figure for one line.
 *
 * ⛔ THIS IS NOT A PRICE. It is never summed into `pricedTotal`, it is never
 * written into the user's rate book, and it is absent entirely on any line the
 * user has priced. It exists so a geolocated project can answer "roughly what?"
 * without anybody being able to mistake the answer for a quotation.
 */
export interface LineEstimate {
  readonly rate: number;
  readonly amount: number;
  readonly currency: string;
  readonly bookId: string;
  readonly bookName: string;
  readonly description: string;
  readonly provenance: RatePriceProvenance;
}

export interface CostedLine {
  readonly line: TakeoffLine;
  /** `null` ⇒ this line is NOT in the total. Never coerced to 0. */
  readonly rate: number | null;
  /** `null` ⇒ this line is NOT in the total. Never coerced to 0. */
  readonly amount: number | null;
  readonly source: string | null;
  readonly unpricedReason: UnpricedReason | null;
  /**
   * §REGIONAL-COST-ESTIMATE (L-4830). `null` ⇒ either the user priced this line
   * (an estimate would be noise beside a real rate) or no rate book covers it.
   * NEVER merged into `amount`.
   */
  readonly estimate: LineEstimate | null;
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
   * §REGIONAL-COST-ESTIMATE (L-4830) — the sum of the ESTIMATED amounts, over
   * lines the user has NOT priced.
   *
   * ⛔ IT IS ITS OWN NUMBER. It is not part of `pricedTotal`, and no field on
   * this interface adds the two together. A surface that wants to show "what
   * this might come to" must render two figures and say which is which.
   */
  readonly estimatedTotal: number;
  readonly estimatedLineCount: number;
  /** Lines with neither a typed rate NOR an estimate — the honest remainder. */
  readonly neitherPricedNorEstimatedCount: number;
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
export function applyRates(
  takeoff: TakeoffResult,
  book: RateBook | null,
  /**
   * §REGIONAL-COST-ESTIMATE (L-4830) — the region-resolved published rates, from
   * `resolveRegionalRates()`. OPTIONAL: omitting it is the pre-amendment
   * behaviour exactly, which is what keeps every existing caller correct.
   */
  regional: ResolvedRateBooks | null = null,
): CostedTakeoff {
  const byCode = new Map<string, RateEntry>();
  for (const e of book?.entries ?? []) {
    if (!Number.isFinite(e.rate) || e.rate < 0) continue;
    byCode.set(e.lineCode, e);
  }

  const lines: CostedLine[] = [];
  let pricedTotal = 0;
  let pricedLineCount = 0;
  let unsourcedRateCount = 0;
  let estimatedTotal = 0;
  let estimatedLineCount = 0;
  let neitherCount = 0;
  const unpricedLineCodes: string[] = [];
  const unitMismatchLineCodes: string[] = [];

  /* §REGIONAL-COST-ESTIMATE — an estimate is offered ONLY where the user has not
     priced the line. A published figure sitting beside a rate the user typed is
     noise at best and an invitation to compare an estimate with a quotation at
     worst; the user's number is the answer, full stop. */
  const estimateFor = (line: TakeoffLine): LineEstimate | null => {
    if (!regional) return null;
    const hit = regionalRateForLine(line, regional);
    if (!hit) return null;
    return {
      rate: hit.rate.rate,
      amount: Math.round(line.quantity * hit.rate.rate * 100) / 100,
      currency: hit.book.currency,
      bookId: hit.book.bookId,
      bookName: hit.book.displayName,
      description: hit.rate.description,
      provenance: hit.rate.provenance,
    };
  };

  for (const line of takeoff.lines) {
    const entry = byCode.get(line.code);
    if (!entry) {
      const estimate = estimateFor(line);
      lines.push({ line, rate: null, amount: null, source: null, unpricedReason: 'NO_RATE', estimate });
      unpricedLineCodes.push(line.code);
      if (estimate) { estimatedTotal += estimate.amount; estimatedLineCount++; } else { neitherCount++; }
      continue;
    }
    if (entry.unit !== line.unit) {
      // A €/m² rate against an `ud` quantity is not an approximation, it is a
      // different number. Refuse rather than multiply.
      const estimate = estimateFor(line);
      lines.push({ line, rate: null, amount: null, source: entry.source || null, unpricedReason: 'UNIT_MISMATCH', estimate });
      unpricedLineCodes.push(line.code);
      unitMismatchLineCodes.push(line.code);
      if (estimate) { estimatedTotal += estimate.amount; estimatedLineCount++; } else { neitherCount++; }
      continue;
    }
    const amount = Math.round(line.quantity * entry.rate * 100) / 100;
    // ⛔ NO ESTIMATE ON A PRICED LINE. The user always wins.
    lines.push({ line, rate: entry.rate, amount, source: entry.source || null, unpricedReason: null, estimate: null });
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
  /* §REGIONAL-COST-ESTIMATE — the estimate NEVER enters the total above, and the
     statement says that in words rather than relying on the layout to imply it. */
  if (estimatedLineCount > 0) {
    parts.push(
      `${estimatedLineCount} unpriced line${estimatedLineCount === 1 ? ' carries a regional ESTIMATE' : 's carry regional ESTIMATES'} `
      + `totalling ${Math.round(estimatedTotal * 100) / 100}. THAT MONEY IS NOT IN THE TOTAL ABOVE. `
      + 'An estimate is a published regional figure with its own database, edition and price date — '
      + 'it is not a quotation, it is not your rate, and typing a rate on a line replaces it entirely.',
    );
  } else if (regional && regional.tier === 'none') {
    parts.push(regional.statement);
  }
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
      estimatedTotal: Math.round(estimatedTotal * 100) / 100,
      estimatedLineCount,
      neitherPricedNorEstimatedCount: neitherCount,
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
