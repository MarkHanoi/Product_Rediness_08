#!/usr/bin/env tsx
/**
 * Phase 2 Task 2.1 — commandManager.execute() + alias ratchet (monotonic gate).
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md §4
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §E.5
 * OI-046 complete 2026-05-16 — all three alias loopholes closed.
 *
 * Hard-fail if ANY of the three counters rises above its ceiling:
 *
 *   A) LITERAL  — commandManager.execute() anywhere in apps/editor/src/
 *      Ceiling: 0 (hard-fail — already migrated).  Any value > 0 = regression.
 *
 *   B) WINDOW   — cmdMgr.execute + window.commandManager references
 *      in apps/editor/src/ (excludes initBusHandlers.ts which is the
 *      intentional bridge between the typed bus and the legacy cmdMgr).
 *      Ceiling: CMDMGR_WINDOW_CEILING (env-override; ratchets down).
 *      2026-05-16 post-E.5.4 actual: 2 (both context-reads, not executes).
 *
 *   C) CM_EXEC  — cm.execute() calls in apps/editor/src/ that escape the
 *      window.commandManager scan — the most common alias pattern.
 *      Excludes initBusHandlers.ts (the sole authorised bridge file).
 *      Ceiling: CMDMGR_CM_EXEC_CEILING (env-override; ratchets down).
 *      2026-05-16 post-E.5.4 actual: 49 (migration backlog for E.5.5+).
 *
 * Baseline file: .ga-gate/baselines/no-commandmanager.json
 * --no-ratchet  : skip the auto-lower write (CI mode).
 *
 * Count methodology:
 *   Literal:  rg "commandManager\.execute" apps/editor/src --type ts
 *             | grep -v "//" | wc -l
 *   Window:   rg "cmdMgr\.execute\b|window\.commandManager\b" apps/editor/src
 *             --type ts --glob '!path-to-initBusHandlers' | grep -v "//" | wc -l
 *             (initBusHandlers.ts excluded — authorised bridge)
 *   CmExec:   rg "\bcm\.execute\b" apps/editor/src --type ts
 *             --glob '!path-to-initBusHandlers' | grep -v "//" | wc -l
 *             (initBusHandlers.ts excluded — authorised bridge)
 *
 * Trajectory (WINDOW + CM_EXEC combined — Phase E.5.x):
 *   2026-05-16 baseline E.5.2     :  111  (cmdMgr.execute + window.commandManager only;
 *                                          cm.execute was not yet tracked → loophole)
 *   OI-046 fix 2026-05-16         :  WINDOW=2, CM_EXEC=49
 *                                    (both tracked separately after E.5.4 plantools migration)
 *   E.5.5 (UI panels batch 1)     :  CM_EXEC ≤ 30  (OverridePanel, ViewsRailPanel, RadialMenu,
 *                                                    HeaderIntentPicker, SpineOverrideList)
 *   E.5.6 (UI panels batch 2)     :  CM_EXEC ≤ 15  (DataWorkbench tree + HierarchyTree actions)
 *   E.5.7 (remaining UI + plantools): CM_EXEC ≤ 5  (ViewPropertiesPanel, SheetEditor,
 *                                                    WindowPlanToolHandler, DoorPlanToolHandler)
 *   E.5.8 (final cleanup)         :  CM_EXEC = 0
 *   WINDOW target                 :  0  (2 context-read-only refs — migrate when stores typed)
 */
/**
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ────────────────────────
 * All three counters used to shell out to `rg ... | grep -v "//" | wc -l` under
 * `shell: '/bin/bash'` — four binaries absent from a stock Windows box. Measured
 * BEFORE this port:
 *
 *     Error: spawnSync /bin/bash ENOENT   → exit 1
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries).
 *
 * ─── The `grep -v` step was never a comment filter ──────────────────────
 * The rg pipeline dropped every line CONTAINING a double slash anywhere. That is
 * wrong in both directions at once:
 *
 *   • it DROPPED real calls carrying a trailing comment or a URL
 *     (`cm.execute(cmd);  // TODO migrate` — a genuine call site, uncounted)
 *   • it KEPT JSDoc body lines, which start with a star and contain no double
 *     slash at all (` * Fix: replace commandManager.execute() with ...` — prose,
 *     counted as a call)
 *
 * The port uses the repo's real comment lexer via `scanFilesStripped`, which is the
 * faithful implementation of what the `grep -v` step was REACHING for. Both numbers
 * are printed on every run so the difference is never invisible again. Measured
 * 2026-08-11 — literal 47 raw / 14 in code; window 96 / 62; cm.execute 67 / 62.
 *
 * ─── Counting unit ─────────────────────────────────────────────
 * The `wc -l` step counted matching LINES. `distinctLines()` reproduces that unit.
 *
 * ─── Scope: RESTATED, NOT NARROWED ──────────────────────────────
 * All three counters scanned `apps/editor/src` with `--type ts`; the port walks that
 * same single directory with the same four extensions. Counters B and C excluded
 * initBusHandlers.ts (the authorised legacy bridge) and globals.d.ts (a declaration
 * file); both exclusions are reproduced exactly in `bridgeExcluded()` below.
 *
 * NOTE — a DIFFERENT gate, `scripts/check/ci-check-no-commandmanager.mjs`
 * (`npm run check:commandmanager`), scans `packages/` and `plugins/`. It is not a
 * duplicate and does not cover this gate's subject: apps/editor/src is scanned by
 * THIS gate alone.
 *
 * Exit: 0 = all three at/under ceiling and baseline · 1 = any over · 2 = misconfigured
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve }                        from 'node:path';
import { scanFiles, scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';
import { blankStringLiterals }                     from './lib/writeRouteScan.js';

const REPO_ROOT      = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE  = resolve(REPO_ROOT, '.ga-gate/baselines/no-commandmanager.json');
const NO_RATCHET     = process.argv.includes('--no-ratchet');

/**
 * Hard ceiling for commandManager.execute() LITERAL calls.
 * Already migrated to 0. Any regression = hard-fail; ceiling NEVER raised.
 */
const LITERAL_CEILING = 0;

/**
 * Ceiling for WINDOW alias patterns (cmdMgr.execute + window.commandManager).
 * Excludes initBusHandlers.ts (intentional bridge, not a migration target).
 * Post-E.5.4 actual: 2 (context-reads; target: 0 when stores are typed).
 */
const WINDOW_CEILING = parseInt(process.env.CMDMGR_WINDOW_CEILING ?? '2', 10);

/**
 * Ceiling for CM_EXEC pattern (cm.execute in apps/editor/src/ excl. bridge).
 * Post-E.5.4 actual: 49 (migration backlog — decreases per E.5.5+ sprint).
 * Override via CMDMGR_CM_EXEC_CEILING env var to step down per-sprint.
 */
const CM_EXEC_CEILING = parseInt(process.env.CMDMGR_CM_EXEC_CEILING ?? '49', 10);

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

const DIRS = ['apps/editor/src'];

/**
 * ⚠ THE HONESTY FLOOR. `apps/editor/src` holds 1,043 TS files today. 700 catches a
 * bad cwd or a vanished subject tree without tripping on ordinary churn. Below it
 * the scan exits 2 — NOT 0 and NOT 1. Load-bearing here: counter A's passing value
 * is 0, so "walked nothing" and "fully migrated" are otherwise identical readings.
 */
const MIN_FILES = 700;

/** Reproduces both negated globs counters B and C passed to rg. */
function bridgeExcluded(rel: string): boolean {
    return rel.endsWith('/initBusHandlers.ts') || rel === 'initBusHandlers.ts'
        || rel.endsWith('/globals.d.ts')       || rel === 'globals.d.ts';
}

let SCANNED = 0;

/** Code-only matching lines — the number every ceiling is evaluated against. */
function codeLines(pattern: RegExp, label: string, exclude?: (r: string) => boolean): Match[] {
    const res = scanFilesStripped({
        root: REPO_ROOT, dirs: DIRS, pattern, minFiles: MIN_FILES,
        exclude, exts: EXTS, label: `no-commandmanager/${label}`,
    });
    SCANNED = res.filesScanned;
    // §FIX-GATE-COUNTS-STRINGS (L-835) — scanFilesStripped removes COMMENTS but
    // deliberately preserves string bodies. Drop any match that survives only
    // inside a string literal: a console.error REPORTING that the legacy path
    // failed is not a USE of the legacy path. Re-tested per line, so a match is
    // kept only if it still matches once string bodies are blanked.
    const inCodeOnly = distinctLines(res.matches).filter(
        m => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(blankStringLiterals(m.text)),
    );
    return inCodeOnly;
}

/** Every matching line, comments INCLUDED. Reported for context, never enforced. */
function mentionLines(pattern: RegExp, label: string, exclude?: (r: string) => boolean): number {
    const res = scanFiles({
        root: REPO_ROOT, dirs: DIRS, pattern, minFiles: MIN_FILES,
        exclude, exts: EXTS, label: `no-commandmanager/${label}-mentions`,
    });
    return distinctLines(res.matches).length;
}

/**
 * §FIX-P6-GATE-PRECISION (L-835, 2026-08-11) — two over-matches, both corrected.
 * Neither is a relaxation: the ceiling stays 0 and the gate still FAILS. They
 * make the number MEAN what the gate says it means.
 *
 *  1. The trailing `\b` excludes `commandManager.executeChunked(...)`.
 *     `executeChunked` is a DIFFERENT method — declared only on
 *     CommandManagerImpl (packages/command-registry/src/CommandManagerImpl.ts
 *     :316), it awaits the command's own chunked implementation and yields a
 *     frame between batches so a 1,300-element project open does not block the
 *     main thread. THE BUS HAS NO CHUNKED-DISPATCH API, so this site is not
 *     migratable in principle, and counting it against a P6 ceiling asserted a
 *     violation that has no available fix. Without the `\b`, a regex written for
 *     `execute` claimed a method whose name merely starts the same way.
 *
 *  2. Counting is now done over stripCommentsAndStrings, so the gate no longer
 *     counts its own subject appearing inside a DIAGNOSTIC ABOUT it:
 *         console.error('…: commandManager.execute failed:', err)
 *         console.warn('… commandManager.execute not available — skipping …')
 *     Both are the codebase REPORTING that the legacy path failed. Counting the
 *     report as a use is the same defect as counting a comment.
 *
 * Honest reading: 14 -> 11. The remaining 11 were each verified by hand and are
 * documented in ISSUE-LOG §8; every one of them regresses if migrated today.
 */
const LITERAL_PATTERN = /commandManager\.execute\b/;
const WINDOW_PATTERN  = /cmdMgr\.execute\b|window\.commandManager\b/;
const CM_EXEC_PATTERN = /\bcm\.execute\b/;

/** Print every offending site — the rg version printed only a bare count. */
function listSites(matches: readonly Match[], limit = 40): void {
    for (const m of matches.slice(0, limit)) {
        console.error(`      ${m.file}:${m.line}  ${m.text.slice(0, 120)}`);
    }
    if (matches.length > limit) console.error(`      … and ${matches.length - limit} more.`);
}

interface Baseline {
    windowCount:    number;
    cmExecuteCount: number;
}

function loadBaseline(): Baseline {
    if (!existsSync(BASELINE_FILE)) {
        return { windowCount: WINDOW_CEILING, cmExecuteCount: CM_EXEC_CEILING };
    }
    const data = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    return {
        windowCount:    data.windowCount    ?? data.aliasCount ?? WINDOW_CEILING,
        cmExecuteCount: data.cmExecuteCount ?? CM_EXEC_CEILING,
    };
}

function writeBaseline(windowCount: number, cmExecuteCount: number): void {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
            {
                windowCount,
                cmExecuteCount,
                ratchedAt: new Date().toISOString(),
                comment:
                    'OI-046 complete 2026-05-16. Three-counter gate: (A) literal=0 hard-fail, ' +
                    '(B) window alias (cmdMgr.execute+window.commandManager excl. bridge) ratchet, ' +
                    '(C) cm.execute excl. initBusHandlers.ts ratchet. ' +
                    'Trajectory: WINDOW 2→0, CM_EXEC 49→30→15→5→0 per Phase E.5.5–E.5.8.',
            },
            null,
            2,
        ) + '\n',
    );
}

function checkCounter(
    label:   string,
    current: number,
    ceiling: number,
    baseline: number,
    failed:  boolean,
): boolean {
    if (current > ceiling) {
        console.error(
            `[no-commandmanager] FAIL (${label}): ${current} exceeds CEILING ${ceiling}.`,
        );
        console.error(
            `  Fix: migrate to window.runtime?.bus?.executeCommand() per` +
            ` docs/03_PRYZM3/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §E.5`,
        );
        return true;
    }
    if (current > baseline) {
        console.error(
            `[no-commandmanager] FAIL (${label} ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(
            `  ${current - baseline} new ${label} call(s) introduced — ratchet regression.`,
        );
        return true;
    }
    return false;
}

function main(): number {
    const literalM   = codeLines(LITERAL_PATTERN, 'literal');
    const windowM    = codeLines(WINDOW_PATTERN,  'window',     bridgeExcluded);
    const cmExecuteM = codeLines(CM_EXEC_PATTERN, 'cm.execute', bridgeExcluded);
    const literal    = literalM.length;
    const window_    = windowM.length;
    const cmExecute  = cmExecuteM.length;
    const baseline   = loadBaseline();
    let failed = false;

    // State the subject size and BOTH units. A gate that reports only its verdict
    // cannot be distinguished from a gate that walked nothing.
    console.log(
        `[no-commandmanager] files scanned: ${SCANNED} (floor ${MIN_FILES}) · ` +
        `dir: apps/editor/src · unit: matching lines`,
    );
    console.log(
        `[no-commandmanager] code-only (ENFORCED) literal=${literal} window=${window_} cm.execute=${cmExecute}` +
        `  ·  incl. comments literal=${mentionLines(LITERAL_PATTERN, 'literal')}` +
        ` window=${mentionLines(WINDOW_PATTERN, 'window', bridgeExcluded)}` +
        ` cm.execute=${mentionLines(CM_EXEC_PATTERN, 'cm.execute', bridgeExcluded)}`,
    );

    // A) Literal — hard-fail
    if (literal > LITERAL_CEILING) {
        console.error(
            `[no-commandmanager] FAIL (literal): commandManager.execute = ${literal}` +
            ` exceeds LITERAL_CEILING ${LITERAL_CEILING} — hard regression.`,
        );
        console.error(
            '  Fix: migrate to runtime.bus.executeCommand() per' +
            ' docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5',
        );
        listSites(literalM);
        failed = true;
    } else {
        console.log(`[no-commandmanager] OK (literal): ${literal} / ${LITERAL_CEILING}`);
    }

    // B) Window alias ratchet
    const windowFailed = checkCounter('window', window_, WINDOW_CEILING, baseline.windowCount, failed);
    if (windowFailed) listSites(windowM);
    if (!windowFailed) {
        if (window_ < baseline.windowCount) {
            if (NO_RATCHET) {
                console.log(
                    `[no-commandmanager] OK (window): ${window_}` +
                    ` (would ratchet ${baseline.windowCount} → ${window_}; --no-ratchet active).`,
                );
            } else {
                console.log(
                    `[no-commandmanager] OK (window): ${window_}` +
                    ` (ratchet lowered ${baseline.windowCount} → ${window_}).`,
                );
            }
        } else {
            console.log(`[no-commandmanager] OK (window): ${window_} / ${WINDOW_CEILING}`);
        }
    }
    failed = failed || windowFailed;

    // C) cm.execute ratchet
    const cmFailed = checkCounter('cm.execute', cmExecute, CM_EXEC_CEILING, baseline.cmExecuteCount, failed);
    if (cmFailed) listSites(cmExecuteM);
    if (!cmFailed) {
        if (cmExecute < baseline.cmExecuteCount) {
            if (NO_RATCHET) {
                console.log(
                    `[no-commandmanager] OK (cm.execute): ${cmExecute}` +
                    ` (would ratchet ${baseline.cmExecuteCount} → ${cmExecute}; --no-ratchet active).`,
                );
            } else {
                console.log(
                    `[no-commandmanager] OK (cm.execute): ${cmExecute}` +
                    ` (ratchet lowered ${baseline.cmExecuteCount} → ${cmExecute}).`,
                );
            }
        } else {
            console.log(`[no-commandmanager] OK (cm.execute): ${cmExecute} / ${CM_EXEC_CEILING}`);
        }
    }
    failed = failed || cmFailed;

    // Write unified baseline if any ratchet improved and we're not in --no-ratchet mode
    if (!failed && !NO_RATCHET) {
        const newWindow   = Math.min(window_,    baseline.windowCount);
        const newCmExec   = Math.min(cmExecute,  baseline.cmExecuteCount);
        if (newWindow < baseline.windowCount || newCmExec < baseline.cmExecuteCount) {
            writeBaseline(newWindow, newCmExec);
        }
    }

    return failed ? 1 : 0;
}

process.exit(main());
