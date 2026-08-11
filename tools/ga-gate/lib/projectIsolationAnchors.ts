/**
 * @file tools/ga-gate/lib/projectIsolationAnchors.ts
 *
 * §FIX-ISOLATION-GATE-BLIND (L-827) — the pure, testable core of
 * `check-project-isolation.ts`.
 *
 * WHY THIS IS A SEPARATE MODULE. The gate itself calls `process.exit()` at
 * module scope, so it cannot be imported by a test without terminating the test
 * runner. The audit's finding was that this gate had NEVER BEEN WATCHED FAIL —
 * it returned a well-formed `0` for every anchor on every Windows run and that
 * was absorbed as declared debt. A gate nobody has seen fail is a gate nobody
 * has verified. Splitting the decision out of the process-exit shell is what
 * makes "prove it can still fail" a unit test instead of a risky experiment that
 * renames files in a tree other agents are editing.
 *
 * The three states this module distinguishes are the whole point:
 *   • SATISFIED    — the anchor is present in CODE
 *   • MISSING      — the anchor is genuinely absent (a real C13 regression)
 *   • NO_SUBJECT   — the file could not be read at all
 *
 * NO_SUBJECT must never collapse into MISSING. That collapse is precisely the
 * bug being fixed: "I could not look" and "I looked and it is gone" were the
 * same value, so a gate measuring nothing looked like a gate reporting a fault.
 */

import { stripComments } from './writeRouteScan';

export interface AnchorSpec {
    readonly label:   string;
    /** Repo-relative path of the file that must contain the anchor. */
    readonly file:    string;
    /** Matched against COMMENT-STRIPPED source. */
    readonly pattern: RegExp;
    readonly minHits: number;
}

export type AnchorStatus = 'SATISFIED' | 'MISSING' | 'NO_SUBJECT';

export interface AnchorResult {
    readonly spec: AnchorSpec;
    readonly status: AnchorStatus;
    /** Matches in code (comments stripped). 0 when NO_SUBJECT. */
    readonly codeHits: number;
    /**
     * Matches that occur ONLY inside comments. Reported, never counted toward
     * `minHits` — §RAF-GATE-COMMENT-BLIND (2026-08-10), where four of five
     * "rAF owners" were comment lines, three of them doc comments asserting
     * P3 compliance. A doc comment claiming compliance is not compliance.
     */
    readonly proseHits: number;
}

/** Count non-overlapping matches. Always applied with the `g` flag. */
export function countMatches(source: string, pattern: RegExp): number {
    const re = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
    );
    let n = 0;
    while (re.exec(source) !== null) n++;
    return n;
}

/**
 * Evaluate one anchor.
 *
 * `readFile` returns `null` when the subject cannot be read. It is injected
 * rather than imported so a test can exercise NO_SUBJECT without touching the
 * filesystem — which matters here, because the real subjects live in packages
 * that other agents edit concurrently.
 */
export function evaluateAnchor(
    spec: AnchorSpec,
    readFile: (relPath: string) => string | null,
): AnchorResult {
    const raw = readFile(spec.file);
    if (raw === null) {
        return { spec, status: 'NO_SUBJECT', codeHits: 0, proseHits: 0 };
    }
    const codeHits = countMatches(stripComments(raw), spec.pattern);
    const rawHits  = countMatches(raw, spec.pattern);
    return {
        spec,
        status:    codeHits >= spec.minHits ? 'SATISFIED' : 'MISSING',
        codeHits,
        proseHits: Math.max(0, rawHits - codeHits),
    };
}

export type GateExit = 0 | 1 | 2;

/**
 * Fold anchor results into an exit code.
 *
 * ANY `NO_SUBJECT` wins over any `MISSING`. Exit 2 is deliberately not 1:
 * exit 1 is absorbable as declared debt in `gate-debt.json`, exit 2 never is.
 * A misconfigured gate must be louder than a failing one, because a failing
 * gate is at least telling the truth about the code.
 */
export function foldExitCode(results: readonly AnchorResult[]): GateExit {
    if (results.length === 0) return 2;                                  // nothing evaluated is not a pass
    if (results.some(r => r.status === 'NO_SUBJECT')) return 2;
    if (results.some(r => r.status === 'MISSING'))    return 1;
    return 0;
}
