// GATE — arithmetic cross-check (`ORDINANCE-EXTRACTION-PIPELINE.md` §2 Stage 4,
// L-590g §3.2).
//
// ⭐ THE FREE IN-DOCUMENT SIGNAL. Where a document is internally redundant, an
// identity between cells catches a plausible-wrong digit that every character
// check passes. The pilot measured this catching 2 of 2 real misreads on the Can
// Figuerola table (`Sup.planta × plantas = Sup.edificada`): row H's last cell and
// row I's irreconcilable triple.
//
// Pure: numbers in, verdict out.

import { type GateResult } from '../types.js';

export interface ArithmeticCrossCheckInput {
    /** The operands of the identity, e.g. [floorArea_m2, storeys]. */
    readonly operands: readonly number[];
    /** How the operands combine to the expected value. */
    readonly op: 'product' | 'sum';
    /** The redundant cell the identity should reproduce (e.g. built-area). */
    readonly expected: number;
    /**
     * Absolute tolerance on the residual. Default 0.02 — tight, because published
     * area tables are internally exact to the last stated decimal, so a residual
     * beyond a cent-scale rounding band is a genuine misread, not noise.
     *
     * ⚠ Callers extracting figures rounded to N decimals should widen this to the
     * propagated last-place uncertainty of the operands (see note below); the
     * default is calibrated to 2-dp cent-exact tables (the pilot's case).
     */
    readonly absoluteTolerance?: number;
    /** Relative tolerance, applied as max(absoluteTolerance, rel*|expected|). Default 0. */
    readonly relativeTolerance?: number;
}

export interface ArithmeticCrossCheckResult extends GateResult {
    /** The value the identity computed from the operands. */
    readonly computed: number;
    /** |computed - expected|. */
    readonly residual: number;
    /** The tolerance the residual was compared against. */
    readonly tolerance: number;
}

// NOTE on tolerance & operand rounding. `241,63 × 6 = 1449,78`, but 241,63 is
// itself rounded to 2 dp, so the TRUE product spans 1449.75–1449.81. A residual up
// to ~operandCount × 0.005 is therefore explainable by rounding alone. The default
// 0.02 flags the pilot's row H (read 1449.81 vs computed 1449.78, residual 0.03)
// as it should for a cent-exact table; a caller working with coarser figures raises
// the tolerance rather than get false flags. The gate always REPORTS the residual so
// a human can judge borderline cases.

/**
 * Run the identity and rule on the residual.
 *   - `pass` — residual within tolerance (the cells reconcile).
 *   - `flag` — residual exceeds tolerance (a cell is misread; route to human).
 */
export function arithmeticCrossCheck(
    input: ArithmeticCrossCheckInput,
): ArithmeticCrossCheckResult {
    const { operands, op, expected } = input;
    const absoluteTolerance = input.absoluteTolerance ?? 0.02;
    const relativeTolerance = input.relativeTolerance ?? 0;

    const computed =
        op === 'product'
            ? operands.reduce((a, b) => a * b, 1)
            : operands.reduce((a, b) => a + b, 0);
    const residual = Math.abs(computed - expected);
    const tolerance = Math.max(absoluteTolerance, relativeTolerance * Math.abs(expected));
    const within = residual <= tolerance;

    return {
        gate: 'arithmetic',
        verdict: within ? 'pass' : 'flag',
        computed,
        residual,
        tolerance,
        detail: within
            ? `${op} of [${operands.join(', ')}] = ${computed} ≈ ${expected} (residual ${residual.toPrecision(3)} ≤ ${tolerance}).`
            : `${op} of [${operands.join(', ')}] = ${computed} ≠ ${expected} (residual ${residual.toPrecision(3)} > ${tolerance}) — a cell is misread; route to human.`,
        token: within ? 'arithmetic:pass' : 'arithmetic:flag',
    };
}
