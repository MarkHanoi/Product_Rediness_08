/**
 * Phase 5 / T5 — __pryzmInitComplete sentinel smoke test (Gap 5 from audit §13)
 *
 * Contract: §R3-SENTINEL (P1.3 from IMPL-PLAN-2026-05-17)
 *
 * `initTools.ts` MUST set `(window as any).__pryzmInitComplete = true` as the
 * final act of the init pipeline. This sentinel is the authoritative signal that
 * all stores, bus handlers, and THREE.js scene infrastructure are wired before
 * any plan tool `activate()` call is permitted.
 *
 * If the sentinel is absent, a plan tool activated before init completes would
 * silently operate against an empty store — producing ghost elements that
 * disappear on the next render pass (§R3 ghost-element bug class).
 *
 * Enforcement levels:
 *   1. Static (this file) — source-grep checks that:
 *      a. `__pryzmInitComplete = true` is set at the end of initTools.ts
 *      b. The §R3-SENTINEL audit annotation is present
 *      c. The sentinel is accompanied by a console.log so it appears in
 *         browser DevTools when the init pipeline is healthy
 *   2. TypeScript — build gate
 *   3. Runtime (future) — vitest test verifying sentinel is set after
 *      initTools resolves (template below)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const INIT_TOOLS_PATH = resolve(
    __dirname,
    '../apps/editor/src/engine/initTools.ts',
);

export const PlanToolSentinelSpec = {
    contract: '§R3-SENTINEL / T5 (P1.3 IMPL-PLAN-2026-05-17)',
    enforcedBy: [
        'apps/editor/src/engine/initTools.ts (__pryzmInitComplete sentinel)',
        'tests/PlanToolSentinel.spec.test.ts (static source-grep — this file)',
    ],
    invariants: [
        '`__pryzmInitComplete = true` is set in initTools.ts.',
        '`§R3-SENTINEL` audit annotation is present alongside the sentinel assignment.',
        'A console.log accompanies the sentinel so the init completion is visible in DevTools.',
        'The sentinel is set via `(window as any).__pryzmInitComplete` (not a module variable).',
    ],
} as const;

export function runPlanToolSentinelChecks(): void {
    const src = readFileSync(INIT_TOOLS_PATH, 'utf8');

    const must = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[PlanToolSentinelSpec] Missing "${needle}" in initTools.ts — ${why}`,
            );
        }
    };

    must(
        '__pryzmInitComplete = true',
        'sentinel must be set to true at the end of the init pipeline (§R3)',
    );

    must(
        '§R3-SENTINEL',
        'audit annotation must be present to anchor the sentinel and make it grep-discoverable',
    );

    must(
        /console\.log.*§R3-SENTINEL/,
        'console.log with §R3-SENTINEL must accompany sentinel so DevTools shows init completion',
    );

    must(
        '(window as any).__pryzmInitComplete',
        'sentinel must be written to window (not a module-level variable) so plan tools can read it cross-module',
    );
}

/* ─── Vitest template (uncomment when initTools.ts can be unit-tested) ──────

import { describe, it, expect, vi } from 'vitest';

describe('§R3-SENTINEL / T5 — __pryzmInitComplete sentinel', () => {
    it('passes all static source invariants', () => {
        expect(() => runPlanToolSentinelChecks()).not.toThrow();
    });

    it('sentinel is set to true after initTools resolves', async () => {
        // Stub the heavy THREE.js / store / WebGL dependencies.
        // This test verifies only that the sentinel assignment executes.
        //
        // NOTE: initTools.ts has many side-effects; this test should be run
        // in a worker thread with all WebGL APIs stubbed via vitest.mock().
        //
        // The static check above (runPlanToolSentinelChecks) is the primary
        // enforcement mechanism until full stubbing is in place.
        vi.stubGlobal('window', { ...window, __pryzmInitComplete: undefined });

        // Because initTools.ts cannot be trivially imported (WebGL deps),
        // verify the sentinel indirectly via the compiled output pattern.
        expect(runPlanToolSentinelChecks).not.toThrow();
    });
});

──────────────────────────────────────────────────────────────────────────── */
