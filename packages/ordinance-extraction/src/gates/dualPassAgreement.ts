// GATE — dual-pass agreement (`ORDINANCE-EXTRACTION-PIPELINE.md` §2 Stage 3/4,
// L-590f §3).
//
// Two INDEPENDENT strategies — Pass A (OCR-then-LLM) and Pass B (direct-vision) —
// fail DIFFERENTLY (A loses table structure; B mis-orders two-column layouts), so
// agreement between them is a real signal. Auto-accept a candidate ONLY where
// A == B; disagreement routes to a human.
//
// This module ships the INTERFACE (the two-pass contract) + the pure comparison.
//
// Pure: two candidates → verdict.

import {
    type ExtractionCandidate,
    type GateResult,
} from '../types.js';

/**
 * The dual-pass extraction contract a concrete extractor adapter implements: given
 * a document + field request, return BOTH passes' independent reads. The core never
 * calls a model directly — the adapter (routing through ai-host, writing the C23
 * AIArtefact) is injected. See `pipeline.ts` `ExtractionModelPort`.
 */
export interface DualPassExtractor {
    extractPassA(request: FieldExtractionRequest): Promise<ExtractionCandidate>;
    extractPassB(request: FieldExtractionRequest): Promise<ExtractionCandidate>;
}

/** What one field extraction needs (documentId + page + the field + the crop). */
export interface FieldExtractionRequest {
    readonly documentId: string;
    readonly page: number;
    readonly field: ExtractionCandidate['field'];
    readonly cropRef: string;
    readonly ordinanceRef: string;
}

/** Numbers agree within this absolute epsilon (cent-scale). */
const NUMERIC_EPSILON = 1e-6;

function candidatesAgree(a: ExtractionCandidate, b: ExtractionCandidate): boolean {
    // Attribution must match — the right value on the wrong subzone is WRONG (L-590g §7.3).
    if (a.zoneCode !== b.zoneCode) return false;
    // Both algorithms → agree iff the same rule.
    if (a.value === null || b.value === null) {
        return a.value === null && b.value === null && a.rule === b.rule;
    }
    return Math.abs(a.value - b.value) <= NUMERIC_EPSILON;
}

/**
 * Compare the two passes.
 *   - `pass` — A and B agree (value AND attribution); eligible to auto-accept.
 *   - `flag` — they disagree; route to a human (Stage 5).
 */
export function dualPassAgreement(
    passA: ExtractionCandidate,
    passB: ExtractionCandidate,
): GateResult {
    if (passA.field !== passB.field) {
        return {
            gate: 'dual-pass',
            verdict: 'flag',
            detail: `Passes read different fields (${passA.field} vs ${passB.field}) — cannot compare.`,
            token: 'dual-pass:flag-field-mismatch',
        };
    }

    const agree = candidatesAgree(passA, passB);
    const describe = (c: ExtractionCandidate): string =>
        c.value === null ? `null(${c.rule ?? 'absent'})@${c.zoneCode}` : `${c.value}@${c.zoneCode}`;

    return {
        gate: 'dual-pass',
        verdict: agree ? 'pass' : 'flag',
        detail: agree
            ? `Both passes agree: ${describe(passA)}.`
            : `Passes disagree: A=${describe(passA)} vs B=${describe(passB)} — route to human.`,
        token: agree ? 'dual-pass:pass' : 'dual-pass:flag',
    };
}
