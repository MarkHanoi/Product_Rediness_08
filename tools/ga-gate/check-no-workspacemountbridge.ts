#!/usr/bin/env tsx
/**
 * Task 2.2 — WorkspaceMountBridge elimination (D.4 closure) ratchet (hard gate).
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md §4 Task 2.2
 * Contract: C02 §3 — "The runtime handle MUST flow through function arguments or React
 *           context. It MUST NOT be stored on `window`."
 *           C02 §2 Stage 1 — "After Phase D complete: no `WorkspaceMountBridge`".
 *
 * Hard-fail if the class name `WorkspaceMountBridge` reappears anywhere in
 * src/, packages/, or apps/.  HARD_CEILING = 0 — any reintroduction is an
 * immediate merge blocker.
 *
 * Baseline file: .ga-gate/baselines/no-workspacemountbridge.json
 *
 * --no-ratchet  : skip the auto-lower write (CI mode).
 *
 * Count methodology:
 *   rg "WorkspaceMountBridge" src packages apps --type ts | wc -l
 *
 * D.4 closure history:
 *   Wave 7 (2026-05-01) — class deleted from composeRuntime.ts + buildPersistence.ts.
 *   Task 2.2 (2026-05-09) — all 18 stale comment references scrubbed; gate added.
 *   HARD_CEILING = 0 (permanent).
 *
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ─────────────────────────────
 * This gate used to shell out to `rg … | wc -l` under `shell: '/bin/bash'` —
 * three binaries absent from a stock Windows box. Measured BEFORE this port:
 *
 *     Error: spawnSync /bin/bash ENOENT   → exit 1
 *
 * Note how narrowly this one avoided the worst outcome. `count()` returns 0 for
 * `status === 1`, and 0 is this gate's PASSING value. Had the failing spawn set
 * status 1 rather than a null status, this gate would have printed
 * "OK: 0 = baseline 0 = HARD_CEILING ✅" while reading nothing at all — the exact
 * shape of the check-motion-gate-coverage failure found in this same wave.
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries).
 *
 * ─── ⚠ COMMENTS ARE DELIBERATELY *NOT* STRIPPED HERE ─────────────────────────
 * Every other gate in this wave strips comments, because their assertions are
 * about code. THIS ONE IS DIFFERENT and the difference is intentional.
 *
 * The assertion, as written above and as exercised in Task 2.2, is that the class
 * NAME must not reappear anywhere — the D.4 closure explicitly scrubbed 18 STALE
 * COMMENT references, not 18 call sites. `rg … | wc -l` counted every matching
 * line including comments, and that was the point: a JSDoc still describing
 * `WorkspaceMountBridge` as live architecture is precisely the stale-documentation
 * defect this repo keeps paying for.
 *
 * Stripping comments here would therefore be WEAKENING THE ASSERTION to make the
 * gate easier to pass. It is not done. The gate enforces on the raw count and
 * additionally reports the code-only count, so that if this ever goes red a reader
 * can immediately tell "the class is back" from "a comment mentions it".
 *
 * ─── Counting unit ───────────────────────────────────────────────────────────
 * `rg … | wc -l` counted matching LINES. `distinctLines()` reproduces that unit.
 *
 * ─── Scope: RESTATED, NOT NARROWED — and a KNOWN HOLE ────────────────────────
 * rg scanned `src packages apps` with `--type ts`; the port walks exactly those
 * three roots (those that exist) with the same four extensions.
 *
 * ⚠ `plugins/` (48 packages, L6) was NEVER in this gate's scope and still is not —
 * widening it would be a silent semantic change, so it is left alone and reported
 * instead: a reintroduction of the bridge inside a plugin is invisible to this
 * gate. `plugins/` is scanned for CONTEXT ONLY below and printed, never enforced.
 * Closing that hole needs a founder decision, not a quiet edit here.
 *
 * Exit: 0 = zero references · 1 = any reference · 2 = scan misconfigured
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join }                  from 'node:path';
import { scanFiles, scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/no-workspacemountbridge.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');

/**
 * Hard ceiling — PERMANENT zero.  The workspace bridge (D.4) was deleted in
 * Wave 7 (2026-05-01).  It must NEVER reappear.
 */
const HARD_CEILING = 0;

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

const PATTERN = /WorkspaceMountBridge/;

/** The rg version's three roots, minus any that do not exist in this checkout. */
const DIRS = ['src', 'packages', 'apps'].filter((d) => existsSync(join(REPO_ROOT, d)));

/** Context only — NOT part of the enforced scope. See "a KNOWN HOLE" above. */
const CONTEXT_DIRS = ['plugins'].filter((d) => existsSync(join(REPO_ROOT, d)));

/**
 * ⚠ THE HONESTY FLOOR. src+packages+apps hold 5,389 TS files today. 3,500 catches a
 * bad cwd, a broken GA_GATE_REPO_ROOT or a vanished root without tripping on churn.
 * Below it the scan exits 2 — NOT 0 and NOT 1. This floor is load-bearing for THIS
 * gate above all others: 0 is its passing value, so "walked nothing" and "clean"
 * are otherwise the identical observation.
 */
const MIN_FILES = 3500;

let SCANNED = 0;

/** ENFORCED: every matching line, comments INCLUDED. See the ⚠ note above. */
function findMatches(): Match[] {
    const res = scanFiles({
        root: REPO_ROOT, dirs: DIRS, pattern: PATTERN,
        minFiles: MIN_FILES, exts: EXTS, label: 'no-workspacemountbridge',
    });
    SCANNED = res.filesScanned;
    return distinctLines(res.matches);
}

/** Diagnostic only: lets a red run distinguish "class is back" from "stale JSDoc". */
function countCodeOnly(): number {
    const res = scanFilesStripped({
        root: REPO_ROOT, dirs: DIRS, pattern: PATTERN,
        minFiles: MIN_FILES, exts: EXTS, label: 'no-workspacemountbridge/code',
    });
    return distinctLines(res.matches).length;
}

/** Diagnostic only: the unscanned plugins/ tree. Reported, never enforced. */
function countPlugins(): number {
    if (CONTEXT_DIRS.length === 0) return 0;
    const res = scanFiles({
        root: REPO_ROOT, dirs: CONTEXT_DIRS, pattern: PATTERN,
        minFiles: 0, exts: EXTS, label: 'no-workspacemountbridge/plugins',
    });
    return distinctLines(res.matches).length;
}

function loadBaseline(): number {
    if (!existsSync(BASELINE_FILE)) return HARD_CEILING;
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count;
}

function writeBaseline(n: number): void {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
            {
                count: n,
                ratchedAt: new Date().toISOString(),
                comment:
                    'Auto-ratcheted by tools/ga-gate/check-no-workspacemountbridge.ts.' +
                    ' Task 2.2 (C02 §3 / D.4 closure). HARD_CEILING = 0 — permanent.',
            },
            null,
            2,
        ) + '\n',
    );
}

function main(): number {
    const matches  = findMatches();
    const current  = matches.length;
    const baseline = loadBaseline();

    // State the subject size, not just the verdict. For a gate whose passing value
    // IS zero, "0 found" and "nothing scanned" are otherwise indistinguishable.
    console.log(
        `[no-workspacemountbridge] files scanned: ${SCANNED} (floor ${MIN_FILES}) · ` +
        `dirs: ${DIRS.join(', ')} · unit: matching lines · comments INCLUDED (by design)`,
    );
    console.log(
        `[no-workspacemountbridge] context (NOT enforced): plugins/ = ${countPlugins()} reference(s)`,
    );

    if (current > HARD_CEILING) {
        console.error(
            `[no-workspacemountbridge] FAIL: WorkspaceMountBridge reference count = ${current}` +
            ` exceeds HARD_CEILING ${HARD_CEILING}.`,
        );
        console.error(
            `  ${current} occurrence(s) found — the workspace bridge (D.4) was deleted in Wave 7.`,
        );
        console.error(
            '  Fix: the class must not be re-introduced. Use runtime.workspace.surface' +
            ' (C02 §3) for all workspace lifecycle calls.',
        );
        console.error(
            `  Of the ${current} matching line(s), ${countCodeOnly()} are in CODE` +
            ` (the remainder are comments — stale docs, not a reintroduced class).`,
        );
        for (const m of matches) console.error(`      ${m.file}:${m.line}  ${m.text.slice(0, 120)}`);
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[no-workspacemountbridge] FAIL: count = ${current} > ratchet baseline ${baseline}.`,
        );
        console.error('  The bridge class name was re-introduced. Revert or migrate to runtime.workspace.surface.');
        for (const m of matches) console.error(`      ${m.file}:${m.line}  ${m.text.slice(0, 120)}`);
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(
                `[no-workspacemountbridge] OK: ${current}` +
                ` (would ratchet ${baseline} → ${current}; --no-ratchet active).`,
            );
        } else {
            writeBaseline(current);
            console.log(
                `[no-workspacemountbridge] OK: ${current}` +
                ` (ratchet lowered ${baseline} → ${current}).`,
            );
        }
    } else {
        console.log(`[no-workspacemountbridge] OK: ${current} = baseline ${baseline} = HARD_CEILING. ✅`);
    }
    return 0;
}

process.exit(main());
