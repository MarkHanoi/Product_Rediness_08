#!/usr/bin/env node
// §DEBT-GATE (L-589) — ONE RATCHET ENGINE FOR EVERY TECHNICAL-DEBT METRIC.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT PROBLEM THIS SOLVES, AND WHY THE OBVIOUS FIXES ARE BOTH WRONG
//
// The `Lint` CI job has NEVER been green. 126 of its errors are `@thatopen/components` imports
// across 105 files — and that was **98 files at the repo's INITIAL COMMIT**. The rule has been an
// unsatisfiable hard-fail since day one. Two responses are available and both are bad:
//
//   MODEL A — "fix them all, keep the hard fail". The repo does not move. Rejected.
//   MODEL B — "turn the rule off". Everyone stops caring and the count grows unobserved. Rejected.
//
//   MODEL C — BASELINE RATCHET. A metric may not get WORSE. It may stay flat, and it may improve.
//             Over eighteen months model B gives 126 → 502; model C gives 126 → 0, without ever
//             running a "lint week". This is what large monorepos actually do.
//
// ⚠ WHY THIS IS GENERIC AND NOT AN ESLINT SCRIPT. The repo already ratchets `commandManager.execute`
// with a bespoke script, and `pryzm/no-raf` (P3) and `pryzm/no-window-as-any` (P4) as warn-plus-
// convention. Adding a fourth one-off would make four places to look, four formats and four ways to
// drift. **One engine, any metric, baselines in one file.** A future accessibility count, doc
// coverage, or `any`-usage metric drops in as a row — no new script, no new CI job shape.
//
// ⚠ WORDING IS DELIBERATE. This reports "technical debt baseline maintained", never "warning".
// Nothing is wrong when the baseline holds; the debt is known, bounded and trending down. A gate
// that cries wolf on a healthy state is a gate people learn to ignore.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/check/debt-gate.mjs            # enforce every metric in the baselines file
//   node scripts/check/debt-gate.mjs --update   # rewrite baselines to current (⚠ see below)
//
// ⚠ `--update` IS FOR RATCHETING DOWN, NOT FOR SILENCING A REGRESSION. It refuses to raise a
// baseline. Raising one requires editing the JSON by hand, which is a reviewable diff and therefore
// a decision someone made rather than a command someone ran.

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASELINE_PATH = new URL('./debt-baselines.json', import.meta.url);

/**
 * ⚠ ESLINT IS RUN **ONCE**, AS **JSON**, AND THE RESULT IS PROVEN NON-EMPTY BEFORE IT IS TRUSTED.
 *
 * Two defects were built into this file and caught before it shipped. Both are recorded because the
 * second one is the more instructive:
 *
 * 1. The first draft shelled `npx eslint .` inside EACH metric's counter. Over ~200 tracked files
 *    that is minutes per invocation, and three metrics timed the gate out at ten minutes. **A gate
 *    slow enough to be skipped is a gate that does not exist.** One invocation now.
 *
 * 2. ⚠⚠ **THE SECOND DRAFT USED `--format unix` AND SILENTLY MEASURED NOTHING.** That formatter was
 *    removed from core ESLint; the command exits 2 printing *"The unix formatter is no longer part
 *    of core ESLint"* and emits **no violations at all**. Every counter read 0, every metric
 *    reported "baseline maintained", and **the gate passed while measuring nothing** — on a repo
 *    with 126 `no-restricted-imports` errors. **A FALSE PASS IS WORSE THAN NO GATE**, because it
 *    actively certifies the thing it cannot see.
 *
 * ⇒ That is the **failure-vs-empty conflation** this codebase has been bitten by five times
 * (§CONTEXT-DATA-HONESTY, L-422/457/467/469/579): *"I found zero violations"* and *"I could not
 * measure"* are the same VALUE and must never be the same ANSWER. So this uses the **core `json`
 * formatter** and **refuses to report** unless it can prove it actually parsed a lint run.
 */
function eslintResults() {
    let out = '';
    try {
        out = execSync('npx eslint . --format json', {
            encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (e) {
        // A linter exiting non-zero because it FOUND things is behaving correctly, not failing —
        // its stdout still holds the JSON.
        out = `${e.stdout ?? ''}`;
    }
    const start = out.indexOf('[');
    if (start < 0) throw new Error('eslint produced no JSON — cannot measure (see the note above)');
    let parsed;
    try {
        parsed = JSON.parse(out.slice(start));
    } catch {
        throw new Error('eslint JSON did not parse — cannot measure (see the note above)');
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('eslint reported ZERO FILES — cannot measure (see the note above)');
    }
    return parsed;
}

/** Count violations of one rule across the parsed result. Exact `ruleId` match — no substrings, so
 *  `no-empty` can never absorb `no-empty-function`. */
const countRule = (results, rule) =>
    results.reduce((n, f) => n + (f.messages ?? []).filter((m) => m.ruleId === rule).length, 0);

/** Every metric is `(eslintResults) => number`. Add a row here + a baseline entry; no new script. */
const METRICS = {
    // ~126 at the time of writing, and ~98 files' worth existed at the repo's INITIAL commit.
    // Architectural debt (C14 legacy elimination / the OBC migration), not a style nit.
    'eslint/no-restricted-imports': (r) => countRule(r, 'no-restricted-imports'),
    // P2 - direct `three` imports outside packages/renderer-three.
    'eslint/three-outside-committer': (r) => countRule(r, 'pryzm/no-three-outside-committer'),
    // Trivially fixable; kept visible so it trends down instead of accumulating.
    'eslint/no-empty': (r) => countRule(r, 'no-empty'),
};

const baselines = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
console.log('  running eslint once for every metric…');
const esOut = eslintResults();
const update = process.argv.includes('--update');
const rows = [];
let failed = 0;

for (const [name, measure] of Object.entries(METRICS)) {
    const baseline = baselines[name]?.baseline;
    if (baseline === undefined) {
        console.error(`✖ ${name}: no baseline recorded. Add one to debt-baselines.json.`);
        failed++;
        continue;
    }
    const current = measure(esOut);
    const delta = current - baseline;
    rows.push({ name, baseline, current, delta });
    if (delta > 0) failed++;
    // Ratchet DOWN only. `--update` may never raise a baseline (see the header note).
    if (update && current < baseline) baselines[name].baseline = current;
}

const w = Math.max(...rows.map((r) => r.name.length), 8);
console.log('\n  DEBT GATE — a metric may hold or improve, never worsen\n');
console.log(`  ${'metric'.padEnd(w)}  baseline  current  introduced  status`);
console.log(`  ${'-'.repeat(w)}  --------  -------  ----------  ------`);
for (const r of rows) {
    const introduced = r.delta > 0 ? String(r.delta) : '0';
    const status = r.delta > 0
        ? `FAIL — ${r.delta} new`
        : r.delta < 0
        ? `PASS — debt reduced by ${-r.delta}`
        : 'PASS — baseline maintained';
    console.log(`  ${r.name.padEnd(w)}  ${String(r.baseline).padStart(8)}  ${String(r.current).padStart(7)}  ${introduced.padStart(10)}  ${status}`);
}

if (update) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baselines, null, 2)}\n`);
    console.log('\n  baselines ratcheted down where current < baseline.');
}

if (failed > 0) {
    console.error(
        '\n✖ DEBT GATE FAILED — this change INTRODUCES new violations of a metric that was already ' +
        'at its cap.\n' +
        '  This is not a request to fix the historic debt. It is a request not to add to it.\n' +
        '  Fix the lines your change introduced, or — if the increase is deliberate and justified —\n' +
        '  raise the baseline BY HAND in scripts/check/debt-baselines.json so the decision appears\n' +
        '  in the diff and gets reviewed.\n',
    );
    process.exit(1);
}
console.log('\n✔ DEBT GATE PASSED — technical debt baseline maintained or reduced.\n');
