#!/usr/bin/env node
// scripts/check-a11y-token-contrast.mjs — A.34 / A.32.α
//
// Spec source: docs/02-decisions/contracts/C43-ACCESSIBILITY.md §1.5
// + docs/03-execution/plans/master-execution-tracker.md A.34.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Runs the @pryzm/a11y-tokens audit suite — which asserts every declared
// (foreground, background) pair meets its WCAG threshold (AA / AAA per
// declaration; non-text 3:1 per WCAG 1.4.11). Fails the build (exit 1)
// if any pair below threshold.
//
// This is the STATIC side of the A.32 axe-core gate. The dynamic E2E
// side (Playwright + axe-core against the live editor DOM) is A.32.γ
// PLANNED.
//
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   node scripts/check-a11y-token-contrast.mjs
//
// EXIT CODES
//   0 — every declared pair meets its threshold (audit passes)
//   1 — audit failed; vitest reporter prints the failing pair(s)
//   2 — pnpm / vitest not available
//
// Add to CI:
//   - run after `pnpm install`
//   - before the editor build (audit is < 1 s; cache stays warm)

import { spawnSync } from 'node:child_process';

const result = spawnSync(
    'pnpm',
    [
        '--filter',
        '@pryzm/a11y-tokens',
        'exec',
        'vitest',
        'run',
        '__tests__/tokens.test.ts',
        '--reporter=basic',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.error) {
    console.error(`[check-a11y-token-contrast] FATAL — could not spawn pnpm: ${result.error.message}`);
    process.exit(2);
}

if (result.status === 0) {
    console.log(`[check-a11y-token-contrast] PASS — every declared token pair meets its WCAG threshold (C43 §1.5)`);
    process.exit(0);
}

console.error(`\n[check-a11y-token-contrast] FAIL — audit failed (see vitest output above).\nFix by:\n  (a) adjusting one of the token hex values in packages/a11y-tokens/src/tokens.ts\n  (b) lowering the declared minLevel if AAA is overreach for the surface\n  (c) removing the pair if the usage is no longer current\nFailure surfaces the WCAG 2.2 1.4.3 / 1.4.6 / 1.4.11 contract per C43 §1.5.`);
process.exit(1);
