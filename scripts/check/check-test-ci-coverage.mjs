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
 * ─────────────────────────────────────────────────────────────────────────────
 * ARM B — §FILTER-MISSING-SCRIPT-IS-EXIT-0 (added 2026-08-17, L-950)
 * ─────────────────────────────────────────────────────────────────────────────
 * ARM A above covers ONE of the two ways this repo's CI reports green over tests
 * it never ran: the aggregator's `--if-present`. There is a SECOND, and until now
 * it was guarded by nothing at all. Measured:
 *
 *     pnpm --filter @pryzm/ai-host run test:ci
 *     -> "None of the selected packages has a "test:ci" script"
 *     -> EXIT 0
 *
 * That is a NAMED, filtered, non-`--if-present` invocation — the form a CI step
 * uses when it means "run exactly this package's suite" — and pnpm exits 0 when
 * the script does not exist. So a CI step can name a script that was renamed or
 * deleted and go on printing a green tick forever. It is the same defect class the
 * whole repo is fighting: *"I could not look"* returning the same value as
 * *"nothing is wrong."* ARM A cannot see it, because ARM A only inspects the
 * aggregate `test:ci` estate, not what the workflows actually invoke.
 *
 * ARM B parses `.github/workflows/*.yml` for every `pnpm --filter <pkg> run <script>`
 * (and the bare `pnpm --filter <pkg> <script>` form) and asserts the script is
 * actually DECLARED by that package. It is HARD-0 with no baseline: measured at
 * introduction, all 3 such invocations resolved, so there is nothing to grandfather
 * and a baseline would only be a place for future rot to hide.
 *
 * `pnpm --filter <pkg> exec <binary>` is deliberately NOT checked — `exec` runs a
 * binary from node_modules/.bin, not a package script, and a missing binary there
 * exits NON-zero already, so it is not a false-green.
 *
 * Usage:  node scripts/check/check-test-ci-coverage.mjs
 *         node scripts/check/check-test-ci-coverage.mjs --update-baseline
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_PATH = join(ROOT, 'scripts', 'check', 'test-ci-coverage-baseline.json');

/**
 * Workspace roots, READ FROM `pnpm-workspace.yaml` — not hardcoded.
 *
 * This list used to be a hand-maintained copy ("kept explicit so a YAML dependency
 * is not required"). That copy was itself an instance of the defect this gate
 * exists to catch: add a root to `pnpm-workspace.yaml` and the gate would keep
 * reporting a confident, precise, WRONG total, because the packages it never
 * looked at are indistinguishable from packages that were fine. A gate whose own
 * scope can silently drift from the thing it measures is not a gate.
 *
 * Parsed with a line reader rather than a YAML library so the "no dependency"
 * property is kept. Only the two pattern shapes pnpm-workspace.yaml actually uses
 * are supported — `dir/*` and an exact path — and ANYTHING ELSE IS A HARD FAIL
 * rather than a silent skip, for the same reason.
 */
function readWorkspacePatterns() {
    const wsPath = join(ROOT, 'pnpm-workspace.yaml');
    if (!existsSync(wsPath)) {
        console.error(`FAIL: no pnpm-workspace.yaml at ${wsPath} — cannot determine the estate.`);
        process.exit(1);
    }
    const lines = readFileSync(wsPath, 'utf8').split('\n');
    const patterns = [];
    let inPackages = false;
    for (const line of lines) {
        if (/^packages:\s*$/.test(line)) { inPackages = true; continue; }
        if (!inPackages) continue;
        const m = line.match(/^\s+-\s+['"]?([^'"#]+?)['"]?\s*$/);
        if (m) { patterns.push(m[1]); continue; }
        if (/^\S/.test(line)) break;           // next top-level key ends the list
    }
    if (patterns.length === 0) {
        console.error('FAIL: parsed 0 workspace patterns from pnpm-workspace.yaml.');
        process.exit(1);
    }
    return patterns;
}

function discoverWorkspaces() {
    const found = [];
    const unsupported = [];
    for (const pattern of readWorkspacePatterns()) {
        if (pattern.includes('**') || pattern.slice(0, -2).includes('*')) {
            unsupported.push(pattern);
            continue;
        }
        if (pattern.endsWith('/*')) {
            const root = pattern.slice(0, -2);
            const abs = join(ROOT, root);
            if (!existsSync(abs)) continue;
            for (const entry of readdirSync(abs)) {
                if (existsSync(join(abs, entry, 'package.json'))) found.push(`${root}/${entry}`);
            }
        } else if (existsSync(join(ROOT, pattern, 'package.json'))) {
            found.push(pattern);
        }
    }
    if (unsupported.length > 0) {
        console.error('FAIL: pnpm-workspace.yaml uses glob shapes this check cannot expand:');
        for (const p of unsupported) console.error(`  ${p}`);
        console.error('Teach discoverWorkspaces() the shape — do NOT let it silently omit packages.');
        process.exit(1);
    }
    return found.sort();
}

const guarded = [];
const unguarded = [];   // has `test`, no `test:ci` — the silently-skipped set
const untested = [];    // no test script at all

/** package name -> its declared scripts. Used by ARM B. */
const scriptsByName = new Map();

/** ARM C — packages holding test files while declaring no `test` script at all. */
const scriptless = [];

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.turbo']);

/** How many test files does this package tree hold? Walks the whole tree — the
 *  COUNT is reported, so an early exit would make the finding less legible. */
function countTestFiles(dir, budget = { n: 0 }) {
    let entries;
    try { entries = readdirSync(dir); } catch { return budget.n; }
    for (const e of entries) {
        if (SKIP_DIRS.has(e)) continue;
        const p = join(dir, e);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) countTestFiles(p, budget);
        else if (TEST_FILE_RE.test(e)) budget.n++;
    }
    return budget.n;
}

for (const rel of discoverWorkspaces()) {
    const pkg = JSON.parse(readFileSync(join(ROOT, rel, 'package.json'), 'utf8'));
    const name = pkg.name ?? rel;
    const scripts = pkg.scripts ?? {};
    scriptsByName.set(name, scripts);
    if (scripts['test:ci']) guarded.push(name);
    else if (scripts['test']) unguarded.push(name);
    else {
        untested.push(name);
        const n = countTestFiles(join(ROOT, rel));
        if (n > 0) scriptless.push({ name, files: n });
    }
}
unguarded.sort();
scriptless.sort((a, b) => a.name.localeCompare(b.name));

const total = guarded.length + unguarded.length + untested.length;
const pct = ((guarded.length / total) * 100).toFixed(1);

console.log('§L-540-CI-GATE — root `pnpm run test:ci` coverage');
console.log(`  workspaces               : ${total}`);
console.log(`  ENFORCED (has test:ci)   : ${guarded.length}  (${pct}%)`);
console.log(`  SILENTLY SKIPPED         : ${unguarded.length}  (declare \`test\`, no \`test:ci\` -> --if-present drops them)`);
console.log(`  no test script at all    : ${untested.length}  (of which ${scriptless.length} STILL CONTAIN TEST FILES)`);

const priorBaseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : {};

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
            _scriptless_comment:
                'ARM C — packages that CONTAIN test files but declare NO `test` script, so no ' +
                'invocation of any kind can select them. Each key needs a WRITTEN reason; an ' +
                'absent script is never a reason. This map may only SHRINK.',
            scriptless: priorBaseline.scriptless ?? {},
        }, null, 2)}\n`,
    );
    console.log(`\nBaseline written: ${BASELINE_PATH} (${unguarded.length} unguarded entries)`);
    console.log('NOTE: `scriptless` reasons are preserved verbatim — --update-baseline never invents one.');
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

// ─────────────────────────────────────────────────────────────────────────────
// ARM C — §TEST-FILES-WITH-NO-SCRIPT (added 2026-08-17, L-950)
//
// The blind spot BETWEEN the two gates that already existed.
// `tools/ga-gate/check-no-dark-test-files.ts` measures GLOB REACHABILITY and says
// so explicitly — "a file green here can still be run by no CI job — that axis is
// scripts/check/check-test-ci-coverage.mjs." But ARM A only ever looked at
// packages that HAVE a `test` script; a package with no test script at all was
// filed under `untested` and treated as benign.
//
// So a package could ship a `vitest.config.ts`, ship test files that the config's
// globs match — dark-gate GREEN, because a runner reaches them — and declare no
// script whatsoever, so nothing can invoke that runner. ARM A: not my problem.
// Dark gate: not my axis. Measured 2026-08-17, four packages sat in exactly that
// gap, and `@pryzm/geometry-curtain-wall` was 25-of-46 RED inside it.
//
// A test file that no script can run is not coverage. It reads as coverage, which
// is worse than having none.
// ─────────────────────────────────────────────────────────────────────────────

const scriptlessReasons = priorBaseline.scriptless ?? {};
const scriptlessNew = scriptless.filter((s) => !scriptlessReasons[s.name]);
const scriptlessStale = Object.keys(scriptlessReasons).filter(
    (n) => !scriptless.some((s) => s.name === n),
);

console.log(`\n§TEST-FILES-WITH-NO-SCRIPT — packages holding tests nothing can invoke`);
console.log(`  packages with test files but NO \`test\` script : ${scriptless.length}`);
for (const s of scriptless) {
    const reason = scriptlessReasons[s.name];
    console.log(`    ${s.name.padEnd(34)} ${String(s.files).padStart(3)} test file(s)  ${reason ? `[named: ${reason}]` : '<-- UNDECLARED'}`);
}

if (scriptlessNew.length > 0) {
    failed = true;
    console.error('\nFAIL — these packages contain test files and declare NO `test` script:');
    for (const s of scriptlessNew) console.error(`  + ${s.name}  (${s.files} test file(s))`);
    console.error(
        '\nNo invocation of any kind can select these — not the aggregator, not a filter,\n' +
        'not a developer typing `pnpm test`. Add a `test` (and `test:ci`) script, or give\n' +
        'the package a WRITTEN reason in the `scriptless` map of\n' +
        'scripts/check/test-ci-coverage-baseline.json. An absent script is not a reason.',
    );
}

if (scriptlessStale.length > 0) {
    failed = true;
    console.error('\nFAIL — stale `scriptless` reasons (package gone, or it now HAS a `test` script):');
    for (const n of scriptlessStale) console.error(`  - ${n}`);
    console.error('\nRemove these from the `scriptless` map — the ratchet only works if it is tightened.');
}

// ─────────────────────────────────────────────────────────────────────────────
// ARM B — every `pnpm --filter <pkg> run <script>` in CI must name a REAL script.
// ─────────────────────────────────────────────────────────────────────────────

const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');

/** Shell tokens that end the current command; anything after is a new command. */
const TERMINATORS = new Set(['&&', '||', ';', '|', '>', '>>', '2>&1']);

/**
 * Pull every `pnpm --filter <target> [run] <script>` out of one workflow file.
 * Tokenises rather than regexing the whole line, so flag order does not matter.
 */
function extractFilterInvocations(text, file) {
    const found = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Strip whole-line YAML comments — ci.yml documents these very commands in
        // prose, and a gate that reads its own documentation as code is noise.
        if (/^\s*#/.test(line)) continue;
        if (!line.includes('pnpm') || !line.includes('--filter')) continue;

        const tokens = line.trim().split(/\s+/);
        for (let t = 0; t < tokens.length; t++) {
            if (tokens[t] !== 'pnpm') continue;

            let target = null;
            let cursor = t + 1;
            for (; cursor < tokens.length; cursor++) {
                const tok = tokens[cursor];
                if (TERMINATORS.has(tok)) break;
                if (tok === '--filter') { target = tokens[++cursor]; continue; }
                if (tok.startsWith('--filter=')) { target = tok.slice('--filter='.length); continue; }
                if (tok.startsWith('-')) continue;         // any other flag
                break;                                      // first positional
            }
            if (!target || cursor >= tokens.length) continue;

            let verb = tokens[cursor];
            // `exec` runs a binary, not a package script — a missing binary already
            // exits non-zero, so it is not a false-green. Not our business.
            if (verb === 'exec') continue;

            let script = verb === 'run' ? tokens[cursor + 1] : verb;
            if (!script || TERMINATORS.has(script)) continue;
            // `pnpm --filter x install` and friends are builtins, not scripts.
            if (['install', 'add', 'remove', 'update', 'why', 'list', 'publish', 'pack'].includes(script)) continue;

            found.push({
                file: `.github/workflows/${file}`,
                line: i + 1,
                target: target.replace(/^["']|["']$/g, ''),
                script: script.replace(/^["']|["']$/g, ''),
                raw: line.trim(),
            });
        }
    }
    return found;
}

const invocations = [];
if (existsSync(WORKFLOW_DIR)) {
    for (const f of readdirSync(WORKFLOW_DIR)) {
        if (!/\.ya?ml$/.test(f)) continue;
        invocations.push(...extractFilterInvocations(readFileSync(join(WORKFLOW_DIR, f), 'utf8'), f));
    }
}

const broken = [];
const unresolvable = [];
for (const inv of invocations) {
    // A glob filter selects a SET; "did every member declare it" is a different
    // question and none are used today. Flag rather than silently allow.
    if (/[*{}[\]]|\.\.\./.test(inv.target)) { unresolvable.push({ ...inv, why: 'glob/range filter — not statically resolvable' }); continue; }
    const scripts = scriptsByName.get(inv.target);
    if (!scripts) { unresolvable.push({ ...inv, why: 'no workspace package by that name' }); continue; }
    if (!scripts[inv.script]) broken.push(inv);
}

console.log(`\n§FILTER-MISSING-SCRIPT-IS-EXIT-0 — CI \`pnpm --filter\` invocations`);
console.log(`  filtered script invocations : ${invocations.length}`);
console.log(`  resolve to a real script    : ${invocations.length - broken.length - unresolvable.length}`);
console.log(`  NAME A MISSING SCRIPT       : ${broken.length}  (pnpm exits 0 on these — silent green)`);
console.log(`  not statically resolvable   : ${unresolvable.length}`);

if (broken.length > 0) {
    failed = true;
    console.error('\nFAIL — CI invokes these scripts, and the package does not declare them.');
    console.error('`pnpm --filter <pkg> run <missing>` prints "None of the selected packages has a');
    console.error('... script" and EXITS 0, so this step has been reporting a green tick over');
    console.error('nothing. Restore the script, or change the step to name the real one.');
    for (const b of broken) console.error(`  ${b.file}:${b.line}  ${b.target} -> "${b.script}" NOT DECLARED\n      ${b.raw}`);
}

if (unresolvable.length > 0) {
    failed = true;
    console.error('\nFAIL — filter targets that cannot be checked statically:');
    for (const u of unresolvable) console.error(`  ${u.file}:${u.line}  ${u.target} -> "${u.script}"  (${u.why})\n      ${u.raw}`);
    console.error('\nA filter that matches nothing also exits 0. If this is deliberate, make the\ntarget an exact package name so the gate can verify it.');
}

if (failed) process.exit(1);

console.log(`\nOK — unguarded set matches the baseline (${unguarded.length}). It may only shrink.`);
console.log(`OK — all ${invocations.length} filtered CI invocations name a declared script.`);
