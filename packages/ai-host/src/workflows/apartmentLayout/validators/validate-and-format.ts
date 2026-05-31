// Apartment-layout COMBINED VALIDATOR-CALL SURFACE — `validateAndFormatLayout`.
//
// One-call wrapper around the three pure layers shipped across runs 7-11:
//
//   1. `layout-adapter.ts`      — DTO            → ApartmentLayoutForValidation
//   2. `orchestrator.ts`         — input          → AggregatedViolationReport
//   3. `reporting/report-formatter.ts` — report   → Markdown / one-liner
//
// Future callers (the live AI generation path, `runDeterministicLayout.ts`,
// `generate.ts`, the apartment-layout modal) can invoke ONE function to get
// the validation report, the summary line, the full Markdown report, AND the
// legality verdict in a single round-trip — without each call site having
// to import + chain three separate modules.
//
// SCOPE — this slice ships the COMBINED SURFACE ONLY. The wire-in from the
// live AI generation path is a future slice (with user go-ahead).
//
// Architectural rules:
//   • PURE — no I/O, no async, no closures over mutable state, no Date.now /
//     random / Map-iteration leaks. Same input ⇒ exact same output.
//   • POJO inputs / outputs.
//   • Output is FROZEN (`Object.freeze`) so callers can pass the result around
//     without defensive cloning. The nested `report` is already frozen by the
//     orchestrator; freezing the outer envelope here completes the contract.
//   • NO `@pryzm/schemas` dep — consistent with the other validator files.
//   • NO `import * as THREE`, NO DOM, NO async.
//
// summaryLine source: `formatViolationLine` (NOT `summarise`).
//   The two helpers produce IDENTICAL strings on every report — they share
//   the same "N violations: X errors, Y warnings (cls×n, ...)" shape and the
//   same "0 violations" empty-form. We pick `formatViolationLine` because
//   the formatter module is already loaded for `markdownReport`, so there is
//   no extra import / coupling cost. See `validateAndFormat.test.ts` for the
//   pin.

import {
    toValidationInput,
    type AdapterOptions,
    type DtglLayoutDto,
} from './layout-adapter.js';
import {
    passesLegality,
    validateApartmentLayout,
} from './orchestrator.js';
import type { AggregatedViolationReport } from './orchestrator-types.js';
import {
    formatViolationLine,
    formatViolationReport,
    type FormatOptions,
} from '../reporting/index.js';

// ── Options ────────────────────────────────────────────────────────────────

/**
 * Knobs for `validateAndFormatLayout`. Both options are optional — every
 * default mirrors the underlying adapter / formatter defaults.
 */
export interface ValidateAndFormatOptions {
    /** Options passed to the layout adapter (default frontage, glazed
     *  area, default longest usable wall). See `AdapterOptions`. */
    readonly adapter?: AdapterOptions;
    /** Options passed to the report formatter (`verbose`, `maxPerClass`,
     *  `includeLegend`). See `FormatOptions`. */
    readonly format?: FormatOptions;
}

// ── Result ─────────────────────────────────────────────────────────────────

/**
 * One-call result envelope. The raw aggregated `report` is the same object
 * `validateApartmentLayout` returns (same shape, same identity-frozen). The
 * other three fields are derived once at call time so each caller doesn't
 * re-compute them.
 */
export interface ValidateAndFormatResult {
    /** The raw aggregated report — same shape as `validateApartmentLayout`'s
     *  output. Frozen by the orchestrator. */
    readonly report: AggregatedViolationReport;
    /** Whether the layout passes the legality gate (`errors === 0`;
     *  warnings are allowed). Mirrors `passesLegality(report)`. */
    readonly passesLegality: boolean;
    /** One-line summary, e.g. `"3 violations: 2 errors, 1 warning
     *  (A-3×1, G-1×2)"`. Empty form: `"0 violations"`.
     *  Source: `formatViolationLine` (see file header). */
    readonly summaryLine: string;
    /** Full Markdown report (`formatViolationReport(report, opts.format)`). */
    readonly markdownReport: string;
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * One-call surface that combines the three pure layers:
 *
 *   • layout-adapter (DTO → `ApartmentLayoutForValidation`)
 *   • orchestrator   (runs all 16 validators)
 *   • report formatter (Markdown + one-liner)
 *
 * PURE — no I/O, no async. Result is fully frozen (the outer envelope here;
 * the inner `report` is frozen by the orchestrator).
 *
 * Example:
 *
 *   const { passesLegality, summaryLine, markdownReport } =
 *       validateAndFormatLayout(dtoFromEngine);
 *   if (!passesLegality) {
 *       logger.warn(summaryLine);
 *       modal.showReport(markdownReport);
 *   }
 */
export function validateAndFormatLayout(
    dto: DtglLayoutDto,
    opts: ValidateAndFormatOptions = {},
): ValidateAndFormatResult {
    const input = toValidationInput(dto, opts.adapter);
    const report = validateApartmentLayout(input);
    const summaryLine = formatViolationLine(report);
    const markdownReport = formatViolationReport(report, opts.format);
    const passes = passesLegality(report);
    return Object.freeze({
        report,
        passesLegality: passes,
        summaryLine,
        markdownReport,
    });
}
