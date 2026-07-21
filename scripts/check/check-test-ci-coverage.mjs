#!/usr/bin/env node
/**
 * check-test-ci-coverage — §L-540-CI-GATE / L-543
 *
 * THE HOLE THIS CLOSES
 * --------------------
 * The root unit gate is `"test:ci": "pnpm -r --workspace-concurrency=1 --if-present run test:ci"`.
 * `--if-present` SILENTLY SKIPS any workspace with no `test:ci` script. Measured
 * on 2026-07-21: **166 workspaces, 18 declare `test:ci`, 130 declare `test` but
 * NOT `test:ci`, 18 declare no test at all.** So the "full unit gate" enforces
 * ~11% of the estate, and — this is the part that matters — a workspace can LOSE
 * its enforcement, or a new workspace can arrive with none, and nothing says so.
 * `ci.yml` states the limit honestly in a comment; a comment is not a gate.
 *
 * WHAT THIS DOES (AND DELIBERATELY DOES NOT DO)
 * --------------------------------------------
 * It does NOT mass-add `test:ci` scripts. That was considered and REJECTED: 130
 * suites that have never run in CI will contain real red (the L-247 pattern —
 * `packages/picking` had a red test found within ten minutes of first looking),
 * and flipping them all on at once produces a board so red it gets switched back
 * off, which is how the estate got here. Broadening must be batch-by-batch with
 * the red triaged PRODUCT-FIRST.
 *
 * Instead this is a RATCHET. It fails if the unguarded set GROWS beyond the
 * committed baseline, and it fails if the baseline has gone stale (an entry that
 * no longer exists, or one that now HAS `test:ci` and should be removed). The
 * number can only go down. Every run prints the current coverage so the figure
 * is never again something you have to go and measure by hand.
 *
 * To close entries: add `"test:ci"` to a workspace, fix whatever red that
 * reveals, then remove its name from the baseline. The check will insist on that
 * last step.
 *
 * Usage:  node scripts/check/check-test-ci-coverage.mjs
 *         node scripts/check/check-test-ci-coverage.mjs --update-baseline
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'check', 'test-ci-coverage-baseline.json');

/** Workspace roots, mirroring pnpm-workspace.yaml. Kept explicit rather than
 *  parsed so a YAML dependency is not required in a CI check script. */
const GLOB_ROOTS = ['packages', 'tools', 'apps', 'plugins'];
const EXPLICIT = [
    'tests/audit-log-s57',
    'tests/family-load-into-project',
    'tests/family-marketplace-publish',
    'tests/browser-matrix',
    'tests/s70-lifecycle-deletion',
    'tests/ga-gate',
    'tests/integration',
    'tests/commands',
];

function discoverWorkspaces() {
    const found = [];
    for (const root of GLOB_ROOTS) {
        const abs = join(ROOT, root);
        if (!existsSync(abs)) continue;
        for (const entry of readdirSync(abs)) {
            const dir = join(abs, entry);
            if (existsSync(join(dir, 'package.json'))) found.push(`${root}/${entry}`);
        }
    }
    for (const rel of EXPLICIT) {
        if (existsSync(join(ROOT, rel, 'package.json'))) found.push(rel);
    }
    return found.sort();
}

const guarded = [];
const unguarded = [];   // has `test`, no `test:ci` — the silently-skipped set
const untested = [];    // no test script at all

for (const rel of discoverWorkspaces()) {
    const pkg = JSON.parse(readFileSync(join(ROOT, rel, 'package.json'), 'utf8'));
    const name = pkg.name ?? rel;
    const scripts = pkg.scripts ?? {};
    if (scripts['test:ci']) guarded.push(name);
    else if (scripts['test']) unguarded.push(name);
    else untested.push(name);
}
unguarded.sort();

const total = guarded.length + unguarded.length + untested.length;
const pct = ((guarded.length / total) * 100).toFixed(1);

console.log('§L-540-CI-GATE — root `pnpm run test:ci` coverage');
console.log(`  workspaces               : ${total}`);
console.log(`  ENFORCED (has test:ci)   : ${guarded.length}  (${pct}%)`);
console.log(`  SILENTLY SKIPPED         : ${unguarded.length}  (declare \`test\`, no \`test:ci\` -> --if-present drops them)`);
console.log(`  no test script at all    : ${untested.length}`);

if (process.argv.includes('--update-baseline')) {
    writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({
            _comment:
                'Workspaces that declare `test` but not `test:ci`, and are therefore silently ' +
                'skipped by the root `pnpm -r --if-present run test:ci` aggregator. This list may ' +
                'only SHRINK. See scripts/check/check-test-ci-coverage.mjs and audit row L-543.',
            _measured: new Date().toISOString().slice(0, 10),
            unguarded,
        }, null, 2)}\n`,
    );
    console.log(`\nBaseline written: ${BASELINE_PATH} (${unguarded.length} entries)`);
    process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
    console.error(`\nFAIL: no baseline at ${BASELINE_PATH}. Run with --update-baseline once, then commit it.`);
    process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).unguarded ?? [];
const baseSet = new Set(baseline);
const nowSet = new Set(unguarded);

const added = unguarded.filter((n) => !baseSet.has(n));
const stale = baseline.filter((n) => !nowSet.has(n));

let failed = false;

if (added.length > 0) {
    failed = true;
    console.error('\nFAIL — these workspaces are NOT enforced by CI and are not in the baseline:');
    for (const n of added) console.error(`  + ${n}`);
    console.error(
        '\nA workspace whose tests never run in CI is a workspace whose tests do not exist.\n' +
        'Add a `"test:ci"` script to it (and fix whatever red that reveals), or — if it is\n' +
        'deliberately exempt — add it to the baseline WITH a reason in the commit message.',
    );
}

if (stale.length > 0) {
    failed = true;
    console.error('\nFAIL — stale baseline entries (workspace gone, or it now HAS `test:ci`):');
    for (const n of stale) console.error(`  - ${n}`);
    console.error(
        '\nThe ratchet only works if it is tightened when it can be. Remove these from\n' +
        'scripts/check/test-ci-coverage-baseline.json.',
    );
}

if (failed) process.exit(1);

console.log(`\nOK — unguarded set matches the baseline (${unguarded.length}). It may only shrink.`);
