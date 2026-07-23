// GATE — algorithm / drawing-binding detector (`ORDINANCE-EXTRACTION-PIPELINE.md`
// §2 Stage 4, L-590g §4.2/§5).
//
// ⚠ THE FABRICATED-NUMBER TRAP. When an ordinance states a parameter as a RULE
// ("ocupación = resultante de aplicar los parámetros") or points at a DRAWING
// ("segons plànol O 1.2"), an LLM asked "what is the value?" will be tempted to
// COMPUTE and report a number the ordinance never states. The honest extraction is
// `value: null, rule: 'derived' | 'on-drawing'` — NEVER a number.
//
// Pure: text → detection.

import { type GateResult, type NonNumericRule } from '../types.js';

/**
 * Lowercase + strip diacritics so Castilian/Catalan accents (aplicación,
 * paràmetres, plànol) never break a match. `\w` does not match `ó`; substring
 * stems on a folded string do.
 */
function fold(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/['’]/g, "'");
}

/** True when the folded text contains EVERY stem. */
function hasAll(text: string, stems: readonly string[]): boolean {
    return stems.every((s) => text.includes(s));
}

/** Any-of groups of all-of stems that mean "value DERIVED by applying parameters". */
const DERIVED_GROUPS: readonly (readonly string[])[] = [
    ['result', 'aplica', 'parametr'], // resultante/resultat de aplicar/aplicació ... paràmetres
    ['a determinar', 'segun'],
    ['a determinar', 'conforme'],
];

/** Any-of groups that mean "value lives on a DRAWING, not in the text". */
const ON_DRAWING_GROUPS: readonly (readonly string[])[] = [
    ['segun', 'plano'],
    ['segons', 'planol'],
    ['en el plano'],
    ['grafiad'],
    ['documentacio grafica'],
    ['plano de ordenacion'],
    ['planol o'], // "segons plànol O 1.2"
];

export interface AlgorithmDetection {
    readonly isNonNumeric: boolean;
    /** The rule kind when non-numeric, else null. */
    readonly rule: NonNumericRule | null;
}

/** Detect whether a raw ordinance phrase encodes a rule rather than a number. */
export function detectAlgorithm(rawText: string): AlgorithmDetection {
    const t = fold(rawText);
    if (DERIVED_GROUPS.some((g) => hasAll(t, g))) {
        return { isNonNumeric: true, rule: 'derived' };
    }
    if (ON_DRAWING_GROUPS.some((g) => hasAll(t, g))) {
        return { isNonNumeric: true, rule: 'on-drawing' };
    }
    return { isNonNumeric: false, rule: null };
}

/**
 * The algorithm gate as a `GateResult`. It cross-checks the EXTRACTED value against
 * the text:
 *   - text is a rule AND value is null → `pass` (honestly refused a number).
 *   - text is a rule BUT a number was extracted → `flag` (FABRICATED — the worst
 *     failure; the ordinance states no such number).
 *   - text is a plain number → `not-applicable` (nothing for this gate to catch).
 */
export function algorithmGate(rawText: string, extractedValue: number | null): GateResult {
    const { isNonNumeric, rule } = detectAlgorithm(rawText);

    if (!isNonNumeric) {
        return {
            gate: 'algorithm',
            verdict: 'not-applicable',
            detail: 'Text states a value, not a rule.',
            token: 'algorithm:not-applicable',
        };
    }

    if (extractedValue === null) {
        return {
            gate: 'algorithm',
            verdict: 'pass',
            detail: `Value is a rule (${rule}) — correctly extracted as null, not a fabricated number.`,
            token: `algorithm:pass-${rule}`,
        };
    }

    return {
        gate: 'algorithm',
        verdict: 'flag',
        detail: `FABRICATED NUMBER: the ordinance states a rule (${rule}) but ${extractedValue} was extracted. The value must be null.`,
        token: `algorithm:flag-fabricated`,
    };
}
