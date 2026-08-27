/**
 * ScheduleCostBridge — the ONE join between a schedule ROW (one element) and
 * the 5D take-off's cost model (one LINE, which may cover many elements).
 *
 * Layer:     L2 — packages/core-app-model/src/schedules/
 * Contract:  §CONTEXT-DATA-HONESTY / C78 §8.1 — a missing rate and a genuinely
 *            zero cost are DIFFERENT VALUES and must never render the same;
 *            C84 EI-9 — reuses `@pryzm/core-app-model`'s existing take-off +
 *            cost engine (`quantities/QuantityTakeoff.ts` + `CostModel.ts`)
 *            rather than a second costing.
 * §LIVESCHED151 (E), lane LIVESCHED151.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS RATHER THAN A NEW COST ENGINE
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder: *"cost — I want cost to be part of the schedule. We already
 * have in the Data tab the cost 5D tab — I want this data reflected on the
 * schedules on demand."* `CostModel.ts` already produces exactly the honest
 * shape this needs (`CostedLine.amount: number | null` — NEVER 0 for an
 * unpriced line) — but it is a LINE-level artefact: one `CostedLine` prices a
 * GROUP of elements sharing one code (e.g. every door of one leaf-count /
 * profile / size / fire-rating combination, or every room sharing one
 * resolved floor finish). A schedule row is ONE ELEMENT. The join is
 * `TakeoffLine.contributions[]` (§TAKEOFF-DESGLOSE, L-4800) — added
 * specifically so a line's total is auditable element-by-element — read
 * here, never re-derived.
 *
 * ⛔ AN ELEMENT MAY CONTRIBUTE TO SEVERAL LINES. A room contributes to up to
 * THREE (`FIN.FLOOR.*`, `FIN.CEIL.*`, `FIN.WALL.*` — see
 * QuantityTakeoff.ts's "ROOMS — finishes by resolved finish" block); every
 * other measured family contributes to exactly one. This module does not
 * assume either shape — it indexes ALL contributions per element and lets
 * the caller decide what "this row's cost" means (the schedule sums them).
 *
 * ⛔ A CONTRIBUTION'S OWN AMOUNT IS DERIVED, NOT STORED. `CostedLine.amount`
 * is the LINE total; there is no per-contribution amount on the model
 * (adding one would be a second representation of the same rate × quantity
 * fact — exactly what `desgloseSumsToLineTotal()` exists to keep from
 * happening). It is computed here as
 * `contribution.quantity * costedLine.rate`, which is EXACT (not an
 * approximation) because a `RateEntry.rate` is declared price-PER-UNIT, and
 * `desgloseSumsToLineTotal()` guarantees `Σ contributions.quantity ===
 * line.quantity` — so `Σ (contribution.quantity * rate) === line.amount`
 * follows arithmetically (rounded once per contribution here, exactly as
 * `applyRates()` rounds once per line).
 */

import type { CostedLine, CostedTakeoff } from '../quantities/CostModel.js';

/** One element's share of one priced (or unpriced) take-off line. */
export interface ElementCostContribution {
  /** {@link import('../quantities/TakeoffTypes.js').TakeoffLine.code} — the
   *  line this contribution belongs to. Surfaced so a caller can tell two
   *  contributions on the same row apart (e.g. a room's FLOOR vs WALL
   *  finish line) rather than only seeing a single merged number. */
  readonly lineCode: string;
  /** This element's own quantity within the line, in the line's unit —
   *  `TakeoffContribution.quantity`, read directly, never re-measured. */
  readonly quantity: number;
  /** `null` ⇒ the LINE this contribution belongs to has no rate (or a unit
   *  mismatch) — NEVER coerced to 0, exactly like `CostedLine.amount`. */
  readonly amount: number | null;
  /** The line's rate, for display/audit (e.g. "€/m² × quantity = amount").
   *  `null` exactly when `amount` is `null`. */
  readonly rate: number | null;
}

// ⛔ NOT EXPOSED HERE: `TakeoffLine.secondary` (leaf/glazed area, frame
// perimeter, …). MEASURED, not assumed: `LineBuilder.add()` SUMS `secondary`
// across every contributing element on a line (`cur.value += s.value` —
// QuantityTakeoff.ts's own merge step) — it is a LINE-level total, unlike
// `contributions[].quantity`, which stays genuinely per-element. Reading it
// per row would print "all doors of this type's leaf area" on every door of
// that type, not that door's own — an honesty violation of exactly the kind
// this file exists to prevent, so it is refused rather than shipped wrong. A
// correct per-element leaf-area/frame-length column needs the take-off's
// own clear-area formula extracted as a reusable pure function (it is inline
// today, in QuantityTakeoff.ts's door/window block) — a real, named,
// buildable gap, not silently worked around with a second formula.

/**
 * Index every element that contributes to ANY line in a costed take-off.
 * Pure — no I/O, no mutation of `costed`.
 */
export function buildElementCostIndex(
  costed: CostedTakeoff,
): ReadonlyMap<string, readonly ElementCostContribution[]> {
  const index = new Map<string, ElementCostContribution[]>();
  for (const costedLine of costed.lines) {
    const { line, rate, amount: lineAmount } = costedLine as CostedLine;
    for (const contribution of line.contributions) {
      const perElementAmount =
        rate === null || lineAmount === null
          ? null
          : Math.round(contribution.quantity * rate * 100) / 100;
      const entry: ElementCostContribution = {
        lineCode: line.code,
        quantity: contribution.quantity,
        amount: perElementAmount,
        rate,
      };
      const existing = index.get(contribution.elementId);
      if (existing) existing.push(entry);
      else index.set(contribution.elementId, [entry]);
    }
  }
  return index;
}

/** One row's cost, honestly summarised over every line it contributes to. */
export interface ElementCostSummary {
  /** `false` ⇒ this element has NO take-off line at all — the family (or this
   *  specific element) is not reached by the 5D engine today. Distinct from
   *  "measured but unpriced": that is `measured: true, amount: null`. */
  readonly measured: boolean;
  /** Sum of the PRICED contributions only. `null` when nothing is priced —
   *  NEVER 0 standing in for "no rate" (§CONTEXT-DATA-HONESTY). */
  readonly amount: number | null;
  /** `true` ⇒ every contributing line was priced, so `amount` (if non-null)
   *  is the FULL figure. `false` ⇒ `amount` is a LOWER BOUND — one or more
   *  contributing lines carry no rate and are silently excluded from it. */
  readonly complete: boolean;
  /** Human sentence for a tooltip / totals-row footnote. `null` when
   *  `complete` is `true` and `measured` is `true` — nothing to explain. */
  readonly reason: string | null;
}

/** Summarise one row's contributions (from {@link buildElementCostIndex}). */
export function summariseElementCost(
  contributions: readonly ElementCostContribution[] | undefined,
): ElementCostSummary {
  if (!contributions || contributions.length === 0) {
    return {
      measured: false,
      amount: null,
      complete: false,
      reason: 'not measured by the take-off',
    };
  }
  const priced = contributions.filter((c) => c.amount !== null);
  const unpriced = contributions.length - priced.length;
  const complete = unpriced === 0;
  const amount =
    priced.length > 0
      ? Math.round(priced.reduce((s, c) => s + (c.amount ?? 0), 0) * 100) / 100
      : null;
  return {
    measured: true,
    amount,
    complete,
    reason: complete
      ? null
      : priced.length === 0
        ? 'no rate for any contributing line'
        : `no rate for ${unpriced} of ${contributions.length} contributing line(s) — LOWER BOUND`,
  };
}
