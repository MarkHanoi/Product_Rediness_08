/**
 * §FIX-ISOLATION-GATE-BLIND (L-827) — the negative tests for
 * `check-project-isolation.ts`.
 *
 * WHY THIS FILE EXISTS. Until 2026-08-11 this gate had never been watched fail.
 * It shelled out through `execSync('grep -c … 2>/dev/null || echo 0')`, which
 * under Windows `cmd.exe` cannot run, so `|| echo 0` fired and every anchor read
 * as ZERO HITS — silently, without throwing. Meanwhile the gate sat on
 * `gate-debt.json`, so its permanent red was absorbed as declared debt. The
 * result: C13 project isolation was INTACT and UNMEASURED for months, and the
 * ledger asserted the opposite.
 *
 * The audit's instruction for gates in this state is: inject a violation, watch
 * the gate fail, remove it, watch it recover. Doing that against the real
 * subjects would mean renaming files in a tree that a dozen agents are editing
 * concurrently, so the decision logic was extracted to
 * `lib/projectIsolationAnchors.ts` and the same experiment is run here against
 * synthetic sources — deterministic, and it leaves nothing behind.
 *
 * The load-bearing case is T3. It is the ONLY test that would have caught the
 * original bug.
 */

import { describe, it, expect } from 'vitest';

import {
    evaluateAnchor,
    foldExitCode,
    countMatches,
    type AnchorSpec,
} from '../lib/projectIsolationAnchors';

const SPEC: AnchorSpec = {
    label:   'test anchor',
    file:    'fake/Subject.ts',
    pattern: /\bforceReset\b/g,
    minHits: 2,
};

/** A reader that always finds the file, returning `src`. */
const present = (src: string) => () => src;
/** A reader that cannot find the file at all. */
const absent  = () => null;

describe('§FIX-ISOLATION-GATE-BLIND — the three states must stay distinguishable', () => {

    it('T1 — real code hits SATISFY the anchor', () => {
        const r = evaluateAnchor(SPEC, present(`
            class BatchCoordinator {
                forceReset(): void { this.q = []; }
            }
            coordinator.forceReset();
        `));
        expect(r.status).toBe('SATISFIED');
        expect(r.codeHits).toBe(2);
        expect(foldExitCode([r])).toBe(0);
    });

    it('T2 — a genuinely removed anchor is MISSING and exits 1, not 2', () => {
        const r = evaluateAnchor(SPEC, present(`class BatchCoordinator { reset(): void {} }`));
        expect(r.status).toBe('MISSING');
        expect(r.codeHits).toBe(0);
        // Exit 1 — a real, absorbable check failure. It is telling the truth.
        expect(foldExitCode([r])).toBe(1);
    });

    it('T3 — AN UNREADABLE SUBJECT IS NO_SUBJECT AND EXITS 2, NEVER 1 AND NEVER 0', () => {
        // THE REGRESSION TEST FOR THE ACTUAL BUG.
        // The old gate turned "I could not run grep" into hits = 0, which is
        // indistinguishable from "I looked and the anchor is gone". Exit 2 is
        // deliberately not 1: exit 1 is absorbable via gate-debt.json, exit 2
        // never is. If this ever returns 1, the gate can go blind again and be
        // absorbed as declared debt exactly as before.
        const r = evaluateAnchor(SPEC, absent);
        expect(r.status).toBe('NO_SUBJECT');
        expect(foldExitCode([r])).toBe(2);
        expect(foldExitCode([r])).not.toBe(1);
    });

    it('T4 — NO_SUBJECT outranks MISSING when both are present', () => {
        // A misconfigured gate must be LOUDER than a failing one. A failing gate
        // is at least measuring something.
        const missing   = evaluateAnchor(SPEC, present('class C {}'));
        const noSubject = evaluateAnchor(SPEC, absent);
        expect(foldExitCode([missing, noSubject])).toBe(2);
    });

    it('T5 — evaluating NOTHING is exit 2, not a pass', () => {
        // "0 violations" must never be reachable by looking nowhere.
        expect(foldExitCode([])).toBe(2);
    });

    it('T6 — PROSE IS NOT COMPLIANCE: comment mentions do not satisfy the anchor', () => {
        // §RAF-GATE-COMMENT-BLIND (2026-08-10): four of five "rAF owners" were
        // comment lines, three of them doc comments ASSERTING P3 compliance.
        // Measured on the real subject: BatchCoordinator.ts has 33 raw mentions
        // of forceReset and only 2 in code. A gate counting raw text would be
        // satisfied here by documentation alone.
        const r = evaluateAnchor(SPEC, present(`
            /**
             * This class calls forceReset() on project switch, per C13 §4.
             * See forceReset in the teardown sequence. forceReset forceReset.
             */
            class BatchCoordinator { reset(): void {} }
        `));
        expect(r.status).toBe('MISSING');
        expect(r.codeHits).toBe(0);
        expect(r.proseHits).toBeGreaterThan(0);   // reported, never counted
    });

    it('T7 — prose alongside real code is reported but does not inflate the count', () => {
        const r = evaluateAnchor(SPEC, present(`
            /** forceReset forceReset forceReset — three prose mentions. */
            class C { forceReset(): void {} }
            c.forceReset();
        `));
        expect(r.codeHits).toBe(2);
        expect(r.proseHits).toBe(3);
        expect(r.status).toBe('SATISFIED');
    });

    it('T8 — countMatches is non-overlapping and g-flag safe', () => {
        expect(countMatches('a a a', /a/)).toBe(3);
        expect(countMatches('a a a', /a/g)).toBe(3);
        expect(countMatches('', /a/g)).toBe(0);
    });
});
