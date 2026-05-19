#!/usr/bin/env tsx
/**
 * G1-T4 — NME proxy geometry-leak ceiling guard.
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §1 (G1-T4)
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §1 (N1)
 *
 * Hard-fail if ANY `releaseGroups(` call-site is missing the `{ disposeProxies: true }`
 * option that ensures NME proxy EdgesGeometry objects are disposed when no longer needed.
 *
 * Background:
 *   NativeElementMeshExporter.releaseGroups() has two code paths depending on the
 *   `disposeProxies` flag (introduced in G1-T1 / G1-T3):
 *
 *     disposeProxies: true  → iterate group.children, call g.dispose() for every mesh
 *                             whose geometry does NOT have sharedGeometry=true.  This is
 *                             the correct path that prevents EdgesGeometry GPU accumulation.
 *
 *     disposeProxies: false (default) → skip geometry disposal entirely.  Callers that
 *                             still pass no options or { disposeProxies: false } silently
 *                             leak all EdgesGeometry objects created during EPS projection.
 *
 * Pass condition (hard ceiling = 0 violations):
 *   Every `releaseGroups(` call on a single line includes `disposeProxies: true`.
 *
 *   NOTE: multi-line releaseGroups( calls are not detected by the single-line pattern.
 *   If you split a call across lines, ensure the call is followed immediately by
 *   `disposeProxies: true` and add an inline comment `// §G1-T3`.
 *
 * Antipatterns detected (either → exit 1):
 *
 *   Pattern A — releaseGroups called without options:
 *     nme.releaseGroups(groups)
 *     nme.releaseGroups(nativeGroups)
 *
 *   Pattern B — releaseGroups called with disposeProxies: false (explicit leak):
 *     nme.releaseGroups(groups, { disposeProxies: false })
 *
 * Safe usage (NOT flagged):
 *   nme.releaseGroups(groups, { disposeProxies: true })
 *   nme.releaseGroups(nativeGroups, { disposeProxies: true })
 *
 * Exclusions:
 *   node_modules, dist, build, .next  — generated artifacts
 *   attached_assets/**                — snapshots
 *   tools/ga-gate/check-geometry-ceiling.ts — this file
 *   __tests__ / __fixtures__          — test stubs / mocks
 */
import { execFileSync } from 'node:child_process';

const HARD_FAIL = 0;

const EXCLUSIONS = [
    '-g', '!node_modules',
    '-g', '!dist',
    '-g', '!build',
    '-g', '!.next',
    '-g', '!attached_assets/**',
    '-g', '!tools/ga-gate/check-geometry-ceiling.ts',
    '-g', '!**/__tests__/**',
    '-g', '!**/__fixtures__/**',
];

function count(pattern: string): number {
    try {
        const out = execFileSync(
            'rg',
            [pattern, '.', '--type', 'ts', ...EXCLUSIONS, '--count-matches'],
            { encoding: 'utf8' },
        );
        return out.trim().split('\n')
            .filter(Boolean)
            .reduce((sum, line) => {
                const m = line.match(/:(\d+)$/);
                return sum + (m ? parseInt(m[1], 10) : 0);
            }, 0);
    } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 1) return 0;
        throw err;
    }
}

/**
 * Pattern A — releaseGroups called with a single argument (no options object).
 *
 * Matches any `.releaseGroups(` call where the only argument is a plain identifier
 * or identifier[n] and the call closes on the same line:
 *   nme.releaseGroups(groups)
 *   nme.releaseGroups(nativeGroups)
 *   nme.releaseGroups(groups[0])
 *
 * Does NOT match:
 *   nme.releaseGroups(groups, { disposeProxies: true })  ← has second arg
 */
function countPatternA(): number {
    return count(String.raw`\.releaseGroups\(\s*\w[\w.\[\]]*\s*\)`);
}

/**
 * Pattern B — releaseGroups called with disposeProxies: false (explicit leak).
 *
 * Matches:
 *   nme.releaseGroups(groups, { disposeProxies: false })
 */
function countPatternB(): number {
    return count(String.raw`\.releaseGroups\(.*disposeProxies\s*:\s*false`);
}

function main(): number {
    const a = countPatternA();
    const b = countPatternB();
    const total = a + b;

    if (total > HARD_FAIL) {
        console.error(
            `[geometry-ceiling] FAIL: ${total} releaseGroups() violation(s) — geometry leak risk.`,
        );
        if (a > 0) {
            console.error(
                `  Pattern A (single-arg, no disposeProxies): ${a} match(es).`,
            );
            console.error(
                `  Find them: rg '\\.releaseGroups\\(\\s*\\w[\\w.\\[\\]]*\\s*\\)' . --type ts -g '!node_modules' -n`,
            );
        }
        if (b > 0) {
            console.error(
                `  Pattern B (disposeProxies: false): ${b} match(es).`,
            );
            console.error(
                `  Find them: rg '\\.releaseGroups\\(.*disposeProxies\\s*:\\s*false' . --type ts -g '!node_modules' -n`,
            );
        }
        console.error(
            `  Fix: every releaseGroups() call MUST include { disposeProxies: true }.`,
        );
        console.error(
            `  Read: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §1 (G1-T4)`,
        );
        return 1;
    }

    console.log(
        `[geometry-ceiling] OK: 0 releaseGroups() violations (Pattern A=${a}, B=${b}).`,
    );
    return 0;
}

process.exit(main());
